import { createServer as createHttpsServer } from "node:https";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, extname, basename } from "node:path";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import Busboy from "busboy";
import { z } from "zod";
import { monthlyMatrix } from "./attendance_report.js";
import { ensureCurrent } from "./current_attendance.js";
import { importWorker, commitImport } from "./academic_import.js";
import { config } from "./config.js";
import { Native, type Row } from "./native.js";
import { Domain } from "./domain.js";
import { Auth, type Session } from "./auth.js";
import { Orchestrator, type Event } from "./orchestrator.js";
import { McpGateway } from "./mcp_gateway.js";
import { EventHub } from "./events.js";
import { tools, type Principal, type Tool } from "./contracts.js";
import { recordSchemas, id, requestId } from "./schemas.js";
import { transcribe } from "./models.js";
const native = new Native(),
  domain = new Domain(native),
  auth = new Auth(native),
  hub = new EventHub(),
  gateway = new McpGateway(domain);
const socketSessions = new WeakMap<WebSocket, Session>();
const eventBuffer = new Map<string, Promise<void>>();
const orchestrator = new Orchestrator(gateway, async (actor, e) => {
  const previous = eventBuffer.get(e.runId) ?? Promise.resolve();
  const job = previous.then(async () => {
    if (e.revision === 1) {
      await native
        .call("run_create", [
          e.runId,
          actor.id,
          e.state,
          0,
          Math.floor(Date.now() / 1000),
        ])
        .catch(() => {});
    }
    await native.batch([
      { op: "event_create", params: [e.runId, e.revision, JSON.stringify(e)] },
      { op: "run_update", params: [e.state, e.revision, e.runId] },
    ]);
    hub.publish(actor, e);
  });
  eventBuffer.set(e.runId, job);
  await job;
  if (e.state === "completado" || e.state === "error")
    eventBuffer.delete(e.runId);
});
function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
async function json(req: IncomingMessage) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw Error("Usa Content-Type application/json");
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 7000000) throw Error("Solicitud demasiado grande");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function checkOrigin(req: IncomingMessage) {
  const host = req.headers.host;
  if (
    !host ||
    ![
      `127.0.0.1:${config.port}`,
      `localhost:${config.port}`,
      new URL(config.origin).host,
    ].includes(host)
  )
    throw Error("Host no autorizado");
  if (req.headers.origin && !allowedOrigin(req.headers.origin))
    throw Error("Origen no autorizado");
}
function allowedOrigin(origin: string) {
  return [
    config.origin,
    `http://127.0.0.1:${config.port}`,
    `http://localhost:${config.port}`,
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:5173", "http://127.0.0.1:5173"]
      : []),
  ].includes(origin);
}
async function upload(
  req: IncomingMessage,
  owner: number | string,
  kind: string,
) {
  if (!["zip", "xlsx", "xls", "csv", "pdf", "audio"].includes(kind))
    throw Error("Tipo de archivo inválido");
  await mkdir(config.uploads, { recursive: true });
  const uploadId = randomUUID(),
    path = resolve(config.uploads, uploadId);
  let chunks: Buffer[] = [];
  let invalid = false,
    files = 0;
  await new Promise<void>((resolve, reject) => {
    let parser: ReturnType<typeof Busboy>;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 0, parts: 2 },
      });
    } catch (e) {
      reject(e);
      return;
    }
    parser.on("file", (_name, stream) => {
      files++;
      stream.on("limit", () => (invalid = true));
      stream.on("data", (data: Buffer) => chunks.push(data));
      stream.on("error", reject);
    });
    parser.on("filesLimit", () => (invalid = true));
    parser.on("fieldsLimit", () => (invalid = true));
    parser.on("partsLimit", () => (invalid = true));
    parser.on("error", reject);
    req.on("aborted", () => reject(Error("Carga cancelada")));
    parser.on("close", resolve);
    req.pipe(parser);
  });
  if (invalid || files !== 1) throw Error("Carga inválida o mayor de 10 MB");
  const data = Buffer.concat(chunks);
  chunks = [];
  if ((kind === "zip" || kind === "xlsx") && (data[0] !== 80 || data[1] !== 75))
    throw Error("Se requiere un archivo ZIP/XLSX");
  if (kind === "pdf" && data.subarray(0, 5).toString() !== "%PDF-")
    throw Error("Se requiere PDF");
  if (
    kind === "xls" &&
    data.subarray(0, 8).toString("hex") !== "d0cf11e0a1b11ae1"
  )
    throw Error("Se requiere Excel XLS");
  if (kind === "csv" && (data.includes(0) || !data.length))
    throw Error("CSV vacío o binario");
  if (kind === "audio" && data.length < 20) throw Error("Audio vacío");
  await writeFile(path, data, { mode: 0o600 });
  domain.uploads.set(uploadId, {
    path,
    owner,
    kind,
    expires: Math.floor(Date.now() / 1000) + 1800,
  });
  return { uploadId };
}
async function run(
  actor: Principal,
  tool: Tool,
  payload: unknown,
  rid: string,
) {
  /* Use a unique run ID for each attempt; the domain operation ID stays stable for idempotency. */
  const realId = randomUUID();
  // Gateway adapter preserves caller request ID while the event stream has a distinct run ID.
  const engine = new Orchestrator(
    {
      authorize: (a, t, p) => gateway.authorize(a, t, p),
      execute: (a, t, p, _id, s) => gateway.execute(a, t, p, rid, s),
    },
    async (a, e) => {
      if (e.revision === 1)
        await native.call("run_create", [
          e.runId,
          a.id,
          e.state,
          0,
          Math.floor(Date.now() / 1000),
        ]);
      await native.batch([
        {
          op: "event_create",
          params: [e.runId, e.revision, JSON.stringify(e)],
        },
        { op: "run_update", params: [e.state, e.revision, e.runId] },
      ]);
      hub.publish(a, e);
    },
  );
  return engine.runTool(actor, tool, payload, realId);
}
const tls =
  config.tlsCert && config.tlsKey
    ? {
        cert: await readFile(resolve(config.root, config.tlsCert)),
        key: await readFile(resolve(config.root, config.tlsKey)),
      }
    : null;
const create = tls
  ? (listener: Parameters<typeof createServer>[0]) =>
      createHttpsServer(tls, listener as any)
  : createServer;
const server = create(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws://127.0.0.1:* ws://localhost:* wss:; style-src 'self' 'unsafe-inline'; frame-ancestors 'self' http://127.0.0.1:8790 http://127.0.0.1:8791",
  );
  try {
    checkOrigin(req);
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${config.port}`),
      path = url.pathname;
    if (path.startsWith("/api/public/")) {
      const token = path.slice("/api/public/".length);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token))
        throw Error("Invitación inválida");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const [invite] = await native.call<Row[]>("invite_lookup", [
        tokenHash,
        Math.floor(Date.now() / 1000),
      ]);
      if (!invite) throw Error("Invitación vencida");
      if (req.method === "GET") {
        const [survey] = await native.call<Row[]>("survey", [invite.survey_id]);
        return send(res, 200, {
          title: survey.title,
          questions: await native.call("questions", [invite.survey_id]),
        });
      }
      if (req.method === "POST" && url.searchParams.get("upload") === "audio")
        return send(res, 200, await upload(req, tokenHash, "audio"));
      if (req.method === "POST")
        return send(
          res,
          200,
          await domain.submit({ ...(await json(req)), token }),
        );
    }
    if (path.startsWith("/api/")) {
      const profileRoute = ["/api/me", "/api/profiles", "/api/profile"].includes(path);
      const session = auth.require(req, req.method !== "GET", profileRoute);
      const { actor, csrf } = session;
      if (path === "/api/me") {
        res.setHeader(
          "Set-Cookie",
          "sistema_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        );
        return send(res, 200, { actor, csrf, profile: session.profile, locked: session.locked });
      }
      if (path === "/api/profiles" && req.method === "GET")
        return send(res, 200, { profiles: await auth.profiles(), active: session.profile.userId, locked: session.locked });
      if (path === "/api/profile" && req.method === "POST") {
        const b = z.object({ userId: id, pin: z.string().max(12).optional() }).parse(await json(req));
        const next = await auth.switchTo(b.userId, b.pin ?? "");
        await native.call("audit_create", [next.actor.id, "perfil-entrada", String(next.profile.userId), Math.floor(Date.now() / 1000), JSON.stringify({ role: next.profile.role })]);
        return send(res, 200, { actor: next.actor, csrf: next.csrf, profile: next.profile, locked: false });
      }
      if (path === "/api/profile/pin" && req.method === "POST") {
        const b = z.object({ pin: z.string().max(12) }).parse(await json(req));
        return send(res, 200, { profile: await auth.setPin(b.pin.trim()) });
      }
      if (path === "/api/health") {
        return send(res, 200, {
          database: true,
          memory: await native.call("memory"),
          ai: config.ai,
          whisper:
            existsSync(config.whisper) && existsSync(config.whisperModel),
          face:
            existsSync(resolve(config.root, "build/face_extract")) &&
            existsSync(config.detector) &&
            existsSync(config.recognizer),
          references: config.allowWeb,
        });
      }
      if (path === "/api/events/replay") {
        const events = await native.call<Row[]>("events", [actor.id]);
        return send(
          res,
          200,
          events.map((e) => JSON.parse(e.event_json)).reverse(),
        );
      }
      if (path === "/api/upload" && req.method === "POST")
        return send(
          res,
          200,
          await upload(req, actor.id, url.searchParams.get("kind") ?? ""),
        );
      if (path === "/api/academic-import" && req.method === "POST") {
        if (!actor.roles.includes("admin"))
          throw Error("Se requiere administración");
        const b = await json(req);
        const uid = z.string().uuid().parse(b.uploadId);
        const u = domain.takeUpload(uid, actor.id);
        if (
          !["csv", "xls", "xlsx", "pdf"].includes(u.kind) ||
          b.extension !== u.kind
        )
          throw Error("Formato de importación inválido");
        if (b.kind !== "lista" && b.kind !== "horario")
          throw Error("Tipo inválido");
        if (b.kind === "lista" && u.kind === "pdf")
          throw Error("Las listas requieren Excel o CSV");
        if (b.action === "preview")
          return send(
            res,
            200,
            await importWorker({
              action: "preview",
              path: u.path,
              extension: u.kind,
              kind: b.kind,
              sheet: b.sheet,
            }),
          );
        if (b.action !== "commit") throw Error("Acción inválida");
        return send(res, 200, await commitImport(native, actor, b, u));
      }
      if (path === "/api/voice" && req.method === "POST") {
        const { uploadId } = await upload(req, actor.id, "audio");
        const u = domain.takeUpload(uploadId, actor.id);
        const text = await transcribe(u.path, AbortSignal.timeout(120000));
        return send(res, 200, { text });
      }
      if (path === "/api/run" && req.method === "POST") {
        const b = z
          .object({
            text: z.string().min(1).max(4000),
            payload: z.unknown().optional(),
          })
          .parse(await json(req));
        return send(res, 200, await orchestrator.run(actor, b.text, b.payload));
      }
      if (path === "/api/tool" && req.method === "POST") {
        const b = z
          .object({
            tool: z.enum(tools as [Tool, ...Tool[]]),
            payload: z.unknown(),
            requestId,
          })
          .parse(await json(req));
        return send(res, 200, await run(actor, b.tool, b.payload, b.requestId));
      }
      if (path === "/api/attendance/roster" && req.method === "POST") {
        const b = z.object({action:z.enum(["add","edit","remove","move"]),offeringId:id,studentId:id.optional(),targetId:id.optional(),number:z.string().trim().min(1).max(80).optional(),name:z.string().trim().min(1).max(200).optional()}).parse(await json(req));
        const offers = await native.call<Row[]>("offerings");
        if (!offers.some(o => o.id === b.offeringId)) throw Error("Grupo/materia inexistente");
        // Docente: solo altas y bajas en sus propias listas. Editar datos o mover entre grupos es de administración.
        if (!actor.roles.includes("admin")) {
          if (!["add", "remove"].includes(b.action)) throw Error("Se requiere administración para editar o mover alumnos");
          if (offers.find(o => o.id === b.offeringId)?.teacher_id !== session.profile.teacherId) throw Error("Solo puedes modificar tus propias listas");
        }
        const members = await native.call<Row[]>("enrolled_ids",[b.offeringId]);
        const steps: {op:string;params:unknown[]}[] = [];
        if (b.action === "add") {
          if (!b.number || !b.name) throw Error("Indica matrícula y nombre");
          const students = await native.call<Row[]>("students");
          const existing = students.find(s => s.number === b.number);
          if (existing && members.some(e => e.student_id === existing.id)) return send(res,200,{message:"El alumno ya pertenece a esta lista"});
          if (!existing) steps.push({op:"student_create",params:[b.number,b.name,null]});
          steps.push({op:"enroll",params:[existing?.id ?? {$ref:0},b.offeringId]});
        } else {
          if (!b.studentId || !members.some(e => e.student_id === b.studentId)) throw Error("El alumno no pertenece a la lista elegida");
          if (b.action === "edit") {
            if (!b.number || !b.name) throw Error("Indica matrícula y nombre");
            steps.push({op:"student_update",params:[b.number,b.name,b.studentId]});
          } else {
            steps.push({op:"unenroll",params:[b.studentId,b.offeringId]});
            if (b.action === "move") {
              if (!b.targetId || b.targetId === b.offeringId || !offers.some(o => o.id === b.targetId)) throw Error("Selecciona otro grupo/materia válido");
              const target = await native.call<Row[]>("enrolled_ids",[b.targetId]);
              if (!target.some(e => e.student_id === b.studentId)) steps.push({op:"enroll",params:[b.studentId,b.targetId]});
            }
          }
        }
        steps.push({op:"audit_create",params:[actor.id,"lista-"+b.action,String(b.offeringId),Math.floor(Date.now()/1000),JSON.stringify(b)]});
        await native.batch(steps);
        return send(res,200,{message:b.action === "remove" ? "Alumno retirado de esta lista; historial y biometría conservados" : "Lista actualizada correctamente"});
      }
      if (path === "/api/attendance/current" && req.method === "POST") {
        if (!actor.roles.includes("admin"))
          throw Error("Se requiere administración");
        const b = z.object({ teacherId: id, offeringId: id.optional() }).parse(await json(req));
        return send(res, 200, await ensureCurrent(native, b.teacherId, b.offeringId));
      }
      if (path === "/api/attendance/context" && req.method === "GET") {
        const teacherId = Number(url.searchParams.get("teacher"));
        if (!Number.isSafeInteger(teacherId) || teacherId < 1)
          throw Error("Selecciona un docente");
        if (!actor.roles.includes("admin")) {
          const own = await native.call<Row[]>("teacher_user", [actor.id]);
          if (!own.some((t) => t.id === teacherId))
            throw Error("Docente no autorizado");
        }
        const sessions = await native.call<Row[]>("schedules", [
          teacherId,
          teacherId,
          0,
          0,
          0,
          0,
        ]);
        const students = await native.call<Row[]>("students", []);
        const result: Row[] = [];
        for (const session of sessions.filter((s) => !s.cancelled)) {
          const enrolled = await native.call<Row[]>("enrolled", [session.id]);
          result.push({
            ...session,
            students: enrolled.map((e) => ({
              id: e.id,
              name: e.name,
              number: students.find((s) => s.id === e.id)?.number,
              biometric: !!e.model && e.expires_at > Date.now() / 1000,
            })),
            attendance: await native.call("attendance_list", [session.id]),
          });
        }
        const offers = await native.call<Row[]>("offerings");
        const lists = [];
        for (const o of offers.filter((o) => o.teacher_id === teacherId)) {
          const ids = await native.call<Row[]>("enrolled_ids", [o.id]);
          lists.push({
            offering_id: o.id,
            group_code: o.group_code,
            subject: o.subject,
            term: o.term,
            students: students.filter((s) =>
              ids.some((e) => e.student_id === s.id),
            ),
          });
        }
        const sources = await importWorker({
          action: "teacher_sources",
          teacherId,
          home:
            process.env.ACADEMIC_RAG_HOME ||
            resolve(config.root, "../second-brain"),
        });
        for (const list of lists) {
          const roster = sources.find((s: any) => s.kind === "lista" && (s.context.oferta_id === list.offering_id || s.context.grupo === list.group_code || s.roster?.some((r: any) => r.grupo === list.group_code)) && s.roster?.length)?.roster || [];
          const numberOf = (student: Row) => {
            const index = roster.findIndex((r: any) => String(r.matricula) === String(student.number));
            return index >= 0 ? index + 1 : null;
          };
          list.students = list.students.map(s => ({...s, list_number: numberOf(s)}));
          for (const session of result.filter(s => s.offering_id === list.offering_id))
            session.students = session.students.map((s: Row) => ({...s, list_number: numberOf(s)}));
        }
        return send(res, 200, { sessions: result, lists, sources });
      }
      if (path === "/api/attendance/report" && req.method === "GET") {
        const teacherId = id.parse(Number(url.searchParams.get("teacher")));
        if (!actor.roles.includes("admin") && teacherId !== session.profile.teacherId) throw Error("Solo puedes consultar tu propio reporte");
        const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/).parse(url.searchParams.get("month"));
        const blocks = await importWorker({action:"monthly_weekly", teacherId, month, home:process.env.ACADEMIC_RAG_HOME || resolve(config.root,"../second-brain")});
        const offers = await native.call<Row[]>("offerings");
        const subjects = await native.call<Row[]>("subjects",["","",""]);
        const students = await native.call<Row[]>("students");
        const schedules = await native.call<Row[]>("schedules",[teacherId,teacherId,0,0,0,0]);
        const rows: Row[] = [];
        const seen = new Set<string>();
        for (const block of blocks) {
          const offer = offers.find(o => o.teacher_id === teacherId && o.group_code === block.grupo && o.subject_id === subjects.find(s => s.code === block.materia)?.id && o.term === block.periodo);
          if (!offer) continue;
          if (schedules.some(s => s.offering_id !== offer.id && !s.cancelled && s.starts === block.starts && s.ends === block.ends)) continue;
          const key = `${offer.id}:${block.starts}:${block.ends}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const session = schedules.find(s => s.offering_id === offer.id && s.starts === block.starts && s.ends === block.ends);
          const enrolled = await native.call<Row[]>("enrolled_ids",[offer.id]);
          const attendance = session ? await native.call<Row[]>("attendance_list",[session.id]) : [];
          for (const enrollment of enrolled) {
            const student = students.find(s => s.id === enrollment.student_id);
            const record = attendance.find(a => a.student_id === enrollment.student_id);
            rows.push({ date:block.date, group:block.grupo, subject:block.materia, starts:block.starts, ends:block.ends, number:student?.number, name:student?.name,
              status:session?.cancelled ? "Cancelada" : record?.status || (block.ends > Date.now()/1000 ? "Pendiente" : "Falta"), recorded:!!record });
          }
        }
        for (const session of schedules) {
          const date = new Date(session.starts * 1000).toLocaleDateString("sv-SE", {timeZone:"America/Mexico_City"});
          const key = `${session.offering_id}:${session.starts}:${session.ends}`;
          if (!date.startsWith(month) || seen.has(key)) continue;
          const offer = offers.find(o => o.id === session.offering_id);
          if (!offer) continue;
          const enrolled = await native.call<Row[]>("enrolled_ids",[offer.id]);
          const attendance = await native.call<Row[]>("attendance_list",[session.id]);
          for (const enrollment of enrolled) {
            const student = students.find(s => s.id === enrollment.student_id);
            const record = attendance.find(a => a.student_id === enrollment.student_id);
            rows.push({date,group:offer.group_code,subject:subjects.find(s => s.id === offer.subject_id)?.code,starts:session.starts,ends:session.ends,number:student?.number,name:student?.name,status:session.cancelled ? "Cancelada" : record?.status || (session.ends > Date.now()/1000 ? "Pendiente" : "Falta"),recorded:!!record});
          }
        }
        rows.sort((a,b) => a.starts-b.starts || String(a.number).localeCompare(String(b.number)));
        const sources = await importWorker({action:"teacher_sources",teacherId,home:process.env.ACADEMIC_RAG_HOME || resolve(config.root,"../second-brain")});
        const matrix = monthlyMatrix(rows,sources);
        return send(res,200,{month,rows,matrix,note:"Las faltas se calculan contra el horario semanal y las inscripciones actuales. Los días inhábiles requieren cancelar la clase; no se generan sesiones."});
      }
      // Calificaciones · fase 1: historial de asistencia por oferta (fechas × alumnos), con aislamiento por docente.
      const ownOffering = async (offeringId: number) => {
        const offer = (await native.call<Row[]>("offerings")).find(o => o.id === offeringId);
        if (!offer) throw Error("Grupo/materia inexistente");
        if (!actor.roles.includes("admin") && offer.teacher_id !== session.profile.teacherId) throw Error("Solo puedes consultar tus propios grupos");
        return offer;
      };
      if (path === "/api/offerings/mine" && req.method === "GET") {
        const offers = await native.call<Row[]>("offerings");
        return send(res, 200, actor.roles.includes("admin") ? offers : offers.filter(o => o.teacher_id === session.profile.teacherId));
      }
      if (path === "/api/attendance/history" && req.method === "GET") {
        const offer = await ownOffering(id.parse(Number(url.searchParams.get("offering"))));
        const threshold = Math.min(100, Math.max(50, Number(url.searchParams.get("threshold") ?? 80)));
        const rows = await native.call<Row[]>("attendance_history", [offer.id]);
        const now = Date.now() / 1000;
        const sessions = new Map<number, Row>(), students = new Map<number, Row>();
        for (const r of rows) {
          if (!sessions.has(r.session_id)) sessions.set(r.session_id, { id: r.session_id, starts: r.starts, ends: r.ends, cancelled: !!r.cancelled, past: r.starts <= now });
          let st = students.get(r.student_id);
          if (!st) { st = { id: r.student_id, number: r.number, name: r.name, cells: {} as Row }; students.set(r.student_id, st); }
          st.cells[r.session_id] = { status: r.status ?? null, note: r.note ?? null, confidence: r.confidence ?? null };
        }
        const countable = [...sessions.values()].filter(s => s.past && !s.cancelled);
        const list = [...students.values()].map(st => {
          const c = (k: string) => countable.filter(s => st.cells[s.id]?.status === k).length;
          const present = c("present"), late = c("late"), excused = c("excused");
          const absent = countable.length - present - late - excused; // sin registro en clase pasada = falta
          const base = countable.length - excused;
          const pct = base > 0 ? Math.round(((present + late) / base) * 1000) / 10 : null;
          return { ...st, stats: { present, late, excused, absent, sessions: countable.length, pct, risk: pct !== null && pct < threshold } };
        }).sort((a: Row, b: Row) => String(a.name).localeCompare(String(b.name)));
        return send(res, 200, { offering: { id: offer.id, subject: offer.subject, group: offer.group_code, teacher: offer.teacher, term: offer.term }, threshold, sessions: [...sessions.values()], students: list,
          note: "Porcentaje = (presentes + retardos) / (clases impartidas − justificadas). Una clase pasada sin registro cuenta como falta." });
      }
      if (path === "/api/attendance/set" && req.method === "POST") {
        const b = z.object({ sessionId: id, studentId: id, status: z.enum(["present", "late", "excused", "absent"]), note: z.string().trim().min(5, "Justifica la edición (mínimo 5 caracteres)").max(500) }).parse(await json(req));
        const [sess] = await native.call<Row[]>("session", [b.sessionId]);
        if (!sess) throw Error("Sesión inexistente");
        await ownOffering(sess.offering_id);
        if (sess.starts > Date.now() / 1000) throw Error("No se edita la asistencia de una clase futura");
        await native.batch([
          { op: "attendance_set", params: [b.sessionId, b.studentId, b.status, Math.floor(Date.now() / 1000), actor.id, b.note] },
          { op: "audit_create", params: [actor.id, "asistencia-edicion", `${b.sessionId}:${b.studentId}`, Math.floor(Date.now() / 1000), JSON.stringify(b)] },
        ]);
        return send(res, 200, { message: "Asistencia actualizada con justificación auditada" });
      }
      if (path === "/api/attendance/generate" && req.method === "POST") {
        if (!actor.roles.includes("admin"))
          throw Error("Se requiere administración");
        const b = z
          .object({
            documentId: z.string().regex(/^[a-f0-9]{32}$/),
            teacherId: id,
            roomId: id,
            start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            exclude: z
              .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
              .max(200)
              .default([]),
          })
          .parse(await json(req));
        const rooms = await native.call<Row[]>("rooms");
        const room = rooms.find((r) => r.id === b.roomId);
        if (!room) throw Error("Aula inexistente");
        const expanded = await importWorker({
          action: "expand_weekly",
          ...b,
          room: room.name,
          home:
            process.env.ACADEMIC_RAG_HOME ||
            resolve(config.root, "../second-brain"),
        });
        return send(
          res,
          200,
          await commitImport(
            native,
            actor,
            {
              extension: "pdf",
              kind: "horario",
              name: expanded.name,
              teacherId: b.teacherId,
              rows: expanded.rows,
            },
            { path: expanded.path, kind: "pdf" },
          ),
        );
      }
      if (path === "/api/attendance/challenge" && req.method === "POST") {
        const b = z.object({ sessionId: id }).parse(await json(req));
        const s = await domain.session(actor, b.sessionId);
        const time = Math.floor(Date.now() / 1000);
        if (s.closed || time < s.starts - 600 || time > s.ends + 600)
          throw Error("Sesión fuera de horario");
        const order = [-1, 0, 1];
        for (let i = order.length - 1; i > 0; i--) {
          const j = randomBytes(1)[0] % (i + 1);
          [order[i], order[j]] = [order[j], order[i]];
        }
        const challengeId = randomUUID();
        domain.challenges.set(challengeId, {
          actor: actor.id,
          session: b.sessionId,
          order,
          expires: time + 90,
        });
        return send(res, 200, { challengeId, order });
      }
      if (path.startsWith("/api/records/") && req.method === "GET") {
        if (!actor.roles.includes("admin"))
          throw Error("Se requiere administración");
        const op = path.slice(13);
        if (
          ![
            "students",
            "teachers",
            "programs",
            "subjects",
            "groups",
            "rooms",
            "offerings",
            "users",
            "biometrics",
            "enrollments",
          ].includes(op)
        )
          throw Error("Registro inválido");
        return send(
          res,
          200,
          await native.call(op, op === "subjects" ? ["", "", ""] : []),
        );
      }
      if (path === "/api/records" && req.method === "POST") {
        if (!actor.roles.includes("admin"))
          throw Error("Se requiere administración");
        const b = z
          .object({ op: z.string(), params: z.array(z.unknown()), requestId })
          .parse(await json(req));
        const schema = recordSchemas[b.op];
        if (!schema) throw Error("Operación no autorizada");
        const params = schema.parse(b.params);
        if (b.op === "qualification_create") params.push(actor.id);
        const op =
          "record:" +
          b.op +
          ":" +
          createHash("sha256").update(JSON.stringify(params)).digest("hex");
        const [previous] = await native.call<Row[]>("operation", [
          b.requestId,
          actor.id,
          op,
        ]);
        if (previous) return send(res, 200, JSON.parse(previous.result_json));
        const result = await native.batch([
          { op: b.op, params },
          {
            op: "audit_create",
            params: [
              actor.id,
              b.op,
              b.requestId,
              Math.floor(Date.now() / 1000),
              JSON.stringify({ requestId: b.requestId }),
            ],
          },
          {
            op: "operation_create",
            params: [
              b.requestId,
              actor.id,
              op,
              { $result: 0 },
              Math.floor(Date.now() / 1000),
            ],
          },
        ]);
        return send(res, 200, result[0]);
      }
      if (path === "/api/surveys")
        return send(res, 200, await native.call("surveys", [actor.id]));
      if (path.startsWith("/api/artifacts/")) {
        const file = basename(path);
        const match = file.match(/^([0-9a-f-]{36})\.(md|pdf|ipynb)$/);
        if (!match) throw Error("Archivo inválido");
        const [a] = await native.call<Row[]>("artifact", [match[1]]);
        if (!a || a.actor_id !== actor.id) throw Error("Archivo no autorizado");
        const data = await readFile(resolve(config.artifacts, file));
        res.setHeader(
          "Content-Type",
          match[2] === "pdf"
            ? "application/pdf"
            : match[2] === "md"
              ? "text/markdown; charset=utf-8"
              : "application/x-ipynb+json",
        );
        res.setHeader("Content-Disposition", `attachment; filename="${file}"`);
        return res.end(data);
      }
      return send(res, 404, { error: "Ruta no encontrada" });
    }
    const staticRoot = resolve(config.root, "ui/dist");
    let file = resolve(staticRoot, "." + decodeURIComponent(path));
    if (!file.startsWith(staticRoot + "/") && file !== staticRoot)
      throw Error("Ruta inválida");
    if (!existsSync(file) || (await stat(file)).isDirectory())
      file = resolve(staticRoot, "index.html");
    const data = await readFile(file);
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    res.end(data);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Error inesperado";
    send(
      res,
      error === "AUTH_REQUIRED" ? 401 : error === "CSRF_REQUIRED" ? 403 : 400,
      {
        error:
          e instanceof z.ZodError
            ? "Datos inválidos: revisa los campos de la solicitud"
            : error,
      },
    );
  }
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on("upgrade", (req, socket, head) => {
  try {
    checkOrigin(req);
    if (
      req.url !== "/api/events" ||
      !req.headers.origin ||
      !allowedOrigin(req.headers.origin)
    )
      throw Error();
    const session = auth.require(req);
    wss.handleUpgrade(req, socket, head, (ws) => {
      socketSessions.set(ws, session);
      hub.subscribe(session.actor, ws);
      const timer = setTimeout(
        () => ws.close(1008, "Sesión vencida"),
        Math.min(2147483647, Math.max(0, session.expires - Date.now())),
      );
      ws.on("close", () => clearTimeout(timer));
    });
  } catch {
    socket.destroy();
  }
});
const cleanup = setInterval(async () => {
  const time = Math.floor(Date.now() / 1000);
  for (const [id, u] of domain.uploads)
    if (u.expires < time) {
      domain.uploads.delete(id);
      await rm(u.path, { force: true });
    }
  for (const [id, v] of domain.previews)
    if (v.expires < time) domain.previews.delete(id);
  for (const [id, v] of domain.challenges)
    if (v.expires < time) domain.challenges.delete(id);
}, 60000);
cleanup.unref();
server.requestTimeout = 120000;
server.headersTimeout = 10000;
{
  // Migraciones pendientes (respaldo previo con .backup) antes de abrir sesiones.
  const [v] = await native.call<Row[]>("version");
  for (const [target, file] of [[2, "db/002.sql"], [3, "db/003.sql"]] as const) {
    if (Number(v.user_version) >= target) continue;
    execFileSync("sqlite3", [config.database, `.backup '${config.database.replace(/'/g, "''")}.pre-v${target}'`]);
    execFileSync(config.native, [config.database, "--init", resolve(config.root, file)], { stdio: "inherit" });
    v.user_version = target;
    console.log(`Base migrada a versión ${target}.`);
  }
}
await auth.initialize();
server.listen(config.port, config.bind, () =>
  console.log(`Sistema Escolar: ${config.origin}`),
);
process.on("SIGINT", () => {
  clearInterval(cleanup);
  for (const socket of wss.clients) socket.close();
  server.close();
  native.close();
  void gateway.close();
});
