import {confirmFaceMatches} from "./face_consensus.js";
import {
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { DomainPort, Principal, Tool } from "./contracts.js";
import { Native, type Row } from "./native.js";
import { config } from "./config.js";
import { payloads } from "./schemas.js";
import { embed, extractFace, extractFaces, generate, transcribe } from "./models.js";
const now = () => Math.floor(Date.now() / 1000);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
type Upload = {
  path: string;
  owner: number | string;
  kind: string;
  expires: number;
};
type Preview = {
  actor: number;
  offering: number;
  rows: Row[];
  expires: number;
};
let lock = Promise.resolve();
async function exclusive<T>(f: () => Promise<T>) {
  const prev = lock;
  let release!: () => void;
  lock = new Promise((r) => (release = r));
  await prev;
  try {
    return await f();
  } finally {
    release();
  }
}
export class Domain implements DomainPort {
  uploads = new Map<string, Upload>();
  previews = new Map<string, Preview>();
  challenges = new Map<
    string,
    { actor: number; session: number; order: number[]; expires: number }
  >();
  constructor(public native: Native) {}
  async authorize(actor: Principal, tool: Tool, payload: unknown) {
    const p = payloads[tool].parse(payload) as any;
    const admin = actor.roles.includes("admin");
    if (!admin) {
      if (
        tool === "mcp_curriculum_tool" &&
        ["ingest", "index"].includes(p.action)
      )
        throw Error("Se requiere administración");
      if (
        tool === "mcp_scheduler_tool" &&
        ["solve", "cancel"].includes(p.action)
      )
        throw Error("Se requiere administración");
      if (
        tool === "mcp_biometrics_tool" &&
        ["enroll", "delete"].includes(p.action)
      )
        throw Error("Se requiere administración");
      if (tool === "mcp_surveys_tool" && !actor.roles.includes("researcher"))
        throw Error("Se requiere permiso de investigación");
      if (tool === "mcp_grades_tool" && !actor.roles.includes("teacher"))
        throw Error("Se requiere permiso docente");
      if (tool === "mcp_biometrics_tool" && !actor.roles.includes("teacher"))
        throw Error("Se requiere permiso docente");
    }
    if (tool === "mcp_surveys_tool" && p.surveyId) {
      const [s] = await this.native.call<Row[]>("survey", [p.surveyId]);
      if (!s || (!admin && s.owner_id !== actor.id))
        throw Error("Encuesta no autorizada");
    }
    if (tool === "mcp_grades_tool") {
      const preview = p.previewId ? this.previews.get(p.previewId) : null;
      const offering = p.offeringId ?? preview?.offering;
      if (!offering || (preview && preview.actor !== actor.id))
        throw Error("Vista previa inválida");
      await this.offering(actor, offering);
    }
    if (
      (tool === "mcp_biometrics_tool" || tool === "mcp_scheduler_tool") &&
      p.sessionId
    )
      await this.session(actor, p.sessionId);
  }
  async offering(actor: Principal, id: number) {
    const offerings = await this.native.call<Row[]>("offerings");
    const o = offerings.find((x) => x.id === id);
    if (!o) throw Error("Oferta inexistente");
    if (!actor.roles.includes("admin")) {
      const [teacher] = await this.native.call<Row[]>("teacher_user", [
        actor.id,
      ]);
      if (teacher?.id !== o.teacher_id) throw Error("Materia de otro docente");
    }
    return o;
  }
  async session(actor: Principal, id: number) {
    const [s] = await this.native.call<Row[]>("session", [id]);
    if (
      !s ||
      s.cancelled ||
      (!actor.roles.includes("admin") && s.teacher_user_id !== actor.id)
    )
      throw Error("Sesión no autorizada");
    return s;
  }
  takeUpload(id: string, owner: number | string, kind?: string) {
    const u = this.uploads.get(id);
    if (
      !u ||
      u.owner !== owner ||
      u.expires < now() ||
      (kind && u.kind !== kind)
    )
      throw Error("Archivo no autorizado o vencido");
    return u;
  }
  async transaction(
    actor: Principal,
    op: string,
    requestId: string,
    steps: { op: string; params: unknown[]; [key: string]: unknown }[],
    result: unknown,
  ) {
    steps.push(
      {
        op: "audit_create",
        params: [actor.id, op, requestId, now(), JSON.stringify({ requestId })],
      },
      {
        op: "operation_create",
        params: [
          requestId,
          actor.id,
          op,
          result === null ? { $result: 0 } : JSON.stringify(result),
          now(),
        ],
      },
    );
    const results = await this.native.batch(steps);
    return result === null ? results[0] : result;
  }
  async execute(
    actor: Principal,
    tool: Tool,
    raw: unknown,
    requestId: string,
    signal: AbortSignal,
  ) {
    return exclusive(async () => {
      const p = payloads[tool].parse(raw) as any;
      await this.authorize(actor, tool, p);
      signal.throwIfAborted();
      const op = tool + ":" + hash(JSON.stringify(p));
      const [previous] = await this.native.call<Row[]>("operation", [
        requestId,
        actor.id,
        op,
      ]);
      if (previous) return JSON.parse(previous.result_json);
      const commit = (
        steps: { op: string; params: unknown[]; [key: string]: unknown }[],
        result: unknown,
      ) => this.transaction(actor, op, requestId, steps, result);
      if (tool === "mcp_curriculum_tool") {
        if (p.action === "lookup") {
          const normalize = (s: string) =>
            s
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase();
          const query = normalize(p.query);
          const programs = await this.native.call<Row[]>("programs");
          const program = programs.find((x) =>
            query.includes(normalize(x.name)),
          );
          const semesters: Record<string, number> = {
            primer: 1,
            primero: 1,
            segundo: 2,
            tercer: 3,
            tercero: 3,
            cuarto: 4,
            quinto: 5,
            sexto: 6,
            septimo: 7,
            octavo: 8,
            noveno: 9,
            decimo: 10,
          };
          const match = query.match(
            /(primer[o]?|segundo|tercer[o]?|cuarto|quinto|sexto|septimo|octavo|noveno|decimo|\d+)\s+semestre/,
          );
          if (program)
            return this.native.call("semester", [
              program.id,
              match ? (semesters[match[1]] ?? Number(match[1])) : 0,
              match ? (semesters[match[1]] ?? Number(match[1])) : 0,
            ]);
          const subjects = await this.native.call<Row[]>("subjects", [
            "",
            "",
            "",
          ]);
          const subject = subjects.find(
            (x) =>
              query.includes(normalize(x.code)) ||
              query.includes(normalize(x.name)),
          );
          if (subject) {
            if (/temario|unidad|tema|programa/.test(query))
              return this.native.call("syllabus", [subject.id]);
            return [subject];
          }
          const tokens = p.query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) ?? [];
          return tokens.length
            ? this.native.call("rag_text", [
                tokens.map((x: string) => `"${x}"`).join(" OR "),
              ])
            : [];
        }
        if (p.action === "subjects")
          return this.native.call("subjects", [p.query, p.query, p.query]);
        if (p.action === "semester")
          return this.native.call("semester", [
            p.programId,
            p.semester,
            p.semester,
          ]);
        if (p.action === "syllabus")
          return this.native.call("syllabus", [p.subjectId]);
        if (p.action === "search") {
          if (p.semantic) {
            const vector = await embed(p.query, signal);
            return this.native.call("search", [], {
              vector,
              model: config.embedding,
            });
          }
          const tokens = p.query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) ?? [];
          if (!tokens.length) return [];
          return this.native.call("rag_text", [
            tokens.map((x: string) => `"${x}"`).join(" OR "),
          ]);
        }
        if (p.action === "ingest") {
          const u = this.takeUpload(p.uploadId, actor.id, "zip");
          return commit(
            [
              {
                op: "ingest",
                params: [],
                path: u.path,
                subjectId: p.subjectId ?? 0,
              },
            ],
            null,
          );
        }
        if (p.action === "index") {
          let count = 0;
          while (true) {
            const chunks = await this.native.call<Row[]>("unembedded");
            if (!chunks.length) break;
            for (const chunk of chunks) {
              signal.throwIfAborted();
              const vector = await embed(chunk.text, signal);
              await this.native.call("embed", [], {
                chunkId: chunk.id,
                model: config.embedding,
                vector,
              });
              count++;
            }
          }
          return { indexed: count };
        }
        if (p.action === "plan" || p.action === "activity") {
          const subjects = await this.native.call<Row[]>("subjects", [
            "",
            "",
            "",
          ]);
          const subject = subjects.find((x) => x.id === p.subjectId);
          if (!subject) throw Error("Materia inexistente");
          const units = await this.native.call<Row[]>("syllabus", [
            p.subjectId,
          ]);
          if (!units.length)
            throw Error("Captura las unidades del programa antes de generar");
          const topics = units.flatMap((u) => [
            u.title,
            ...JSON.parse(u.topics_json),
          ]);
          let markdown = `# ${subject.code} · ${subject.name}\n\nPrograma académico de 16 semanas y examen final en semana 17.\n\n`;
          let teach = 0;
          for (let week = 1; week <= 17; week++) {
            if ([6, 12, 17].includes(week)) {
              markdown += `## Semana ${week}: ${week === 17 ? "Examen final · 60%" : "Examen parcial · 20%"}\nEvaluación individual con rúbrica publicada y revisión de resultados.\n\n`;
              continue;
            }
            const topic =
              topics[
                Math.min(
                  topics.length - 1,
                  Math.floor((teach++ * topics.length) / 14),
                )
              ];
            markdown += `## Semana ${week}: ${topic}\nActividad: exposición guiada, discusión y resolución de casos sobre ${topic}.\nTarea: resolver un caso y justificar los supuestos.\nCriterios: precisión conceptual (40%), procedimiento (40%) y argumentación (20%).\n\n`;
          }
          if (p.action === "activity") {
            if (
              !/finanz|financ|matem|actuar|estad|investig|anal/i.test(
                subject.name,
              )
            )
              throw Error(
                "Selecciona una materia cuantitativa para esta práctica ejecutable",
              );
            const references = await this.references(p.referenceQuery, signal);
            markdown +=
              p.notebookKind === "statistics"
                ? `# Práctica: análisis descriptivo\n\n## Objetivo\nCalcular distribución, promedio, mediana y varianza de valoraciones sintéticas.\n\n## Marco teórico\nLa media resume el centro; la varianza describe dispersión. El diseño de muestra condiciona la interpretación.\n\n## Ejercicio\nAnaliza [5, 4, 3, 5, 2, 4, 5, 3, 4, 5], calcula métricas y compara subgrupos.\n\n## Conclusiones\nExplica faltantes, sesgo de selección y límites de inferencia.\n\n## Referencias verificadas\n${references.join("\n\n")}\n`
                : `# Práctica: valor presente neto\n\n## Objetivo\nEvaluar un proyecto con descuento de flujos.\n\n## Marco teórico\nVPN = suma de cada flujo dividido entre (1+tasa)^periodo.\n\n## Ejercicio\nInversión inicial 10000; flujos 3500, 4000 y 4500. Compara tasas 5%, 10% y 15%.\n\n## Conclusiones\nExplica sensibilidad a tasa, horizonte y riesgo.\n\n## Referencias verificadas\n${references.join("\n\n")}\n`;
          } else {
            const references = await this.references(
              `${subject.name} university textbook`,
              signal,
            );
            if (!references.length)
              throw Error(
                "No se encontraron referencias verificables; ajusta la consulta",
              );
            markdown +=
              "## Referencias verificadas\n" + references.join("\n\n") + "\n";
          }
          return this.export(
            actor,
            markdown,
            p.action === "activity",
            p.notebookKind ?? "finance",
          );
        }
      }
      if (tool === "mcp_scheduler_tool") {
        if (p.action === "list") {
          if (!actor.roles.includes("admin")) {
            if (actor.roles.includes("teacher")) {
              const [t] = await this.native.call<Row[]>("teacher_user", [
                actor.id,
              ]);
              if (!t) throw Error("Usuario sin docente vinculado");
              p.teacherId = t.id;
            } else {
              const [s] = await this.native.call<Row[]>("student_user", [
                actor.id,
              ]);
              if (!s) throw Error("Usuario sin estudiante vinculado");
              p.studentId = s.id;
            }
          }
          return this.native.call("schedules", [
            p.teacherId,
            p.teacherId,
            p.groupId,
            p.groupId,
            p.studentId,
            p.studentId,
          ]);
        }
        if (p.action === "close" || p.action === "cancel") {
          const s = await this.session(actor, p.sessionId);
          if (p.action === "close" && s.ends > now())
            throw Error("La sesión todavía no termina");
          return commit(
            [
              {
                op: p.action === "close" ? "schedule_close" : "schedule_cancel",
                params:
                  p.action === "close" ? [p.sessionId, now()] : [p.sessionId],
              },
            ],
            { closed: p.sessionId },
          );
        }
        if (p.action === "solve") {
          const slots: number[] = p.slotStarts;
          if (
            slots.some((v, i) => i && v <= slots[i - 1]) ||
            slots.some((v, i) => i % 8 && v - slots[i - 1] !== 3600)
          )
            throw Error(
              "Se requieren 5 días ordenados de 8 slots horarios sin discontinuidad dentro de cada día",
            );
          if (slots[0] < now())
            throw Error("El horario debe comenzar en el futuro");
          const offers = await this.native.call<Row[]>("offerings"),
            rooms = await this.native.call<Row[]>("rooms"),
            existing = await this.native.call<Row[]>(
              "schedules",
              [0, 0, 0, 0, 0, 0],
            );
          const selected = p.offeringIds.map((id: number) =>
            offers.find((o) => o.id === id),
          );
          if (
            selected.some((o: Row) => !o) ||
            new Set(p.offeringIds).size !== selected.length
          )
            throw Error("Ofertas inválidas");
          const groupRecords = await this.native.call<Row[]>("groups");
          const startHour = Number(
            new Intl.DateTimeFormat("en", {
              timeZone: "America/Mexico_City",
              hour: "numeric",
              hourCycle: "h23",
            }).format(new Date(slots[0] * 1000)),
          );
          const shift = startHour < 15 ? "morning" : "evening";
          if (
            selected.some(
              (o: Row) =>
                groupRecords.find((g) => g.id === o.group_id)?.shift !== shift,
            )
          )
            throw Error(
              "Selecciona ofertas de la misma jornada y una ventana horaria compatible",
            );
          const requests: Row[] = [];
          const allEnrollments = await this.native.call<Row[]>("enrollments");
          for (const o of selected) {
            const [ta, ga, enrolled] = await Promise.all([
              this.native.call<Row[]>("availability", [o.teacher_id, shift]),
              this.native.call<Row[]>("group_availability", [o.group_id]),
              this.native.call<Row[]>("enrolled_ids", [o.id]),
            ]);
            let mask = 0n;
            for (let i = 0; i < 40; i++)
              if (
                ta.some((x) => x.slot === i) &&
                ga.some((x) => x.slot === i) &&
                !existing.some(
                  (e) =>
                    !e.cancelled &&
                    (e.teacher_id === o.teacher_id ||
                      e.group_id === o.group_id ||
                      allEnrollments.some(
                        (a) =>
                          a.offering_id === e.offering_id &&
                          enrolled.some((b) => b.student_id === a.student_id),
                      )) &&
                    e.starts < slots[i] + 3600 &&
                    e.ends > slots[i],
                )
              )
                mask |= 1n << BigInt(i);
            const scheduled = existing
              .filter(
                (e) =>
                  !e.cancelled &&
                  e.offering_id === o.id &&
                  e.starts >= slots[0] &&
                  e.ends <= slots[39] + 3600,
              )
              .reduce((n, e) => n + (e.ends - e.starts) / 3600, 0);
            let remaining = o.weekly_hours - scheduled;
            if (remaining < 0)
              throw Error("La oferta ya supera su carga semanal");
            while (remaining > 0) {
              const duration = Math.min(p.duration, remaining);
              requests.push({
                teacher: o.teacher_id,
                group: o.group_id,
                duration,
                capacity: Math.max(1, enrolled.length),
                allowed: mask.toString(16),
                offeringId: o.id,
                students: enrolled.map((e) => e.student_id),
              });
              remaining -= duration;
            }
          }
          const roomInput = rooms.map((room) => {
            let available = 0n;
            for (let i = 0; i < 40; i++)
              if (
                !existing.some(
                  (e) =>
                    !e.cancelled &&
                    e.room_id === room.id &&
                    e.starts < slots[i] + 3600 &&
                    e.ends > slots[i],
                )
              )
                available |= 1n << BigInt(i);
            return {
              capacity: room.capacity,
              available: available.toString(16),
            };
          });
          if (!requests.length)
            return {
              sessions: [],
              committed: false,
              message: "La carga semanal ya está completa",
            };
          if (requests.length > 256)
            throw Error("El lote excede 256 sesiones; divide por jornada");
          const solved = await this.native.call<Row[]>("solve", [], {
            requests,
            rooms: roomInput,
          });
          const sessions = solved.map((a, i) => ({
            offeringId: requests[i].offeringId,
            roomId: rooms[a.room].id,
            starts: slots[a.slot],
            ends: slots[a.slot] + requests[i].duration * 3600,
          }));
          if (!p.commit) return { sessions, committed: false };
          return commit(
            sessions.map((s) => ({
              op: "schedule_create",
              params: [s.offeringId, s.roomId, s.starts, s.ends],
            })),
            { sessions, committed: true },
          );
        }
      }
      if (tool === "mcp_biometrics_tool") {
        if (p.action === "sessions") {
          let teacherId = 0;
          if (!actor.roles.includes("admin")) {
            const [teacher] = await this.native.call<Row[]>("teacher_user", [
              actor.id,
            ]);
            if (!teacher) throw Error("Usuario sin perfil docente");
            teacherId = teacher.id;
          }
          const schedules = await this.native.call<Row[]>("schedules", [
            teacherId,
            teacherId,
            0,
            0,
            0,
            0,
          ]);
          const group = p.query.match(/\b[1-9][01]\d\b/)?.[0];
          return {
            sesiones: schedules.filter(
              (s) =>
                !s.cancelled &&
                !s.closed &&
                s.starts - 600 <= now() &&
                s.ends + 600 >= now() &&
                (!group || s.group_code === group),
            ),
            siguientePaso:
              "Abre Asistencia y selecciona el ID de sesión para capturar el rostro.",
          };
        }
        if (p.action === "delete") {
          const result = await commit(
            [{ op: "biometric_delete", params: [p.studentId] }],
            { deleted: p.studentId },
          );
          await rm(
            resolve(config.root, "data/biometric-photos", p.studentId + ".enc"),
            { force: true },
          );
          return result;
        }
        if (p.action === "enroll") {
          if (p.studentNumber) {
            const students = await this.native.call<Row[]>("students");
            if (!students.some(s => s.id === p.studentId && s.number === p.studentNumber))
              throw Error("El alumno seleccionado no coincide con la matrícula; vuelve a seleccionarlo");
          }
          const attendanceSteps: {op:string;params:unknown[]}[] = [];
          let attendanceEnd: number | undefined;
          if (p.sessionId) {
            const current = await this.session(actor,p.sessionId);
            if (current.closed || now() < current.starts || now() >= current.ends)
              throw Error("El registro de asistencia requiere estar dentro del horario de clase");
            attendanceEnd = current.ends;
            const enrolled = await this.native.call<Row[]>("enrolled",[p.sessionId]);
            if (!enrolled.some(s => s.id === p.studentId)) throw Error("El alumno no pertenece al grupo confirmado");
            const previous = await this.native.call<Row[]>("attendance_list",[p.sessionId]);
            if (!previous.some(a => a.student_id === p.studentId))
              attendanceSteps.push({op:"attendance_create",params:[p.sessionId,p.studentId,"present",now(),actor.id]});
          }
          const existing = await this.native.call<Row[]>("biometrics", []);
          if (
            existing.some(
              (b) => b.student_id === p.studentId && b.expires_at > now(),
            )
          )
            return {
              enrolled: p.studentId,
              alreadyRegistered: true,
              message:
                "El alumno ya tiene biometría registrada; utiliza la verificación de asistencia",
            };
          const file = await this.frame(p.frame);
          try {
            const face = await extractFace(file, signal);
            if (attendanceEnd !== undefined && now() >= attendanceEnd)
              throw Error("La clase terminó durante la captura; no se registró asistencia");
            const model = await this.faceVersion();
            const encrypted = this.encrypt(face.vector);
            const photoDir = resolve(config.root, "data/biometric-photos");
            await mkdir(photoDir, { recursive: true });
            const photo = resolve(photoDir, p.studentId + ".enc");
            const iv = awaitCryptoRandom(12),
              cipher = createCipheriv("aes-256-gcm", this.key(), iv);
            const bytes = Buffer.concat([
              cipher.update(await readFile(file)),
              cipher.final(),
            ]);
            await writeFile(
              photo,
              Buffer.concat([iv, cipher.getAuthTag(), bytes]),
              { mode: 0o600 },
            );
            try {
              return await commit(
                [
                  {
                    op: "biometric_create",
                    params: [
                      p.studentId,
                      model,
                      encrypted,
                      now(),
                      now() + 365 * 86400,
                      512,
                    ],
                  },
                  ...attendanceSteps,
                ],
                { enrolled: p.studentId, photoRegistered: true, attendanceRegistered: !!p.sessionId },
              );
            } catch (error) {
              await rm(photo, { force: true });
              throw error;
            }
          } finally {
            await rm(file, { force: true });
          }
        }
        if (p.action === "verify" && p.frames.length !== (p.captureMode === "single" ? 1 : 3))
          throw Error("La cantidad de capturas no corresponde al modo de verificación");
        const session = await this.session(actor, p.sessionId);
        if (session.closed) throw Error("La sesión está cerrada");
        const previousAttendance = await this.native.call<Row[]>(
          "attendance_list",
          [p.sessionId],
        );
        if (
          p.action === "manual" &&
          previousAttendance.some((a) => a.student_id === p.studentId)
        )
          return {
            studentId: p.studentId,
            alreadyRecorded: true,
            message: "Ya se tomó asistencia a este alumno en esta sesión",
          };
        if (p.action === "manual")
          return commit(
            [
              {
                op: "attendance_create",
                params: [p.sessionId, p.studentId, p.status, now(), actor.id],
              },
              {
                op: "audit_create",
                params: [
                  actor.id,
                  "asistencia-manual",
                  String(p.sessionId),
                  now(),
                  JSON.stringify({ reason: p.reason }),
                ],
              },
            ],
            { studentId: p.studentId, status: p.status },
          );
        if (p.action === "verify") {
          if (now() < session.starts || now() >= session.ends)
            throw Error("Fuera del horario de asistencia");
          const challenge = this.challenges.get(p.challengeId);
          this.challenges.delete(p.challengeId);
          if (
            !challenge ||
            challenge.actor !== actor.id ||
            challenge.session !== p.sessionId ||
            challenge.expires < now()
          )
            throw Error("Desafío facial vencido");
          const files: string[] = [];
          let captures;
          try {
            for (const frame of p.frames) files.push(await this.frame(frame));
            captures = await extractFaces(files, signal);
          } finally {await Promise.all(files.map(file => rm(file,{force:true})));}
          const poses = captures.map((x) => x.pose);
          if (p.captureMode === "gesture" && (
            Math.max(...poses) - Math.min(...poses) < 0.18 ||
            !challenge.order.every((direction, i) =>
              direction === 0
                ? Math.abs(poses[i]) < 0.2
                : direction * poses[i] > 0.07,
            )
          ))
            throw Error(
              "Repite el gesto indicado: frente, izquierda y derecha",
            );
          const model = await this.faceVersion();
          const enrolled = await this.native.call<Row[]>("enrolled", [
            p.sessionId,
          ]);
          const candidates = enrolled
            .filter(
              (s) =>
                s.model === model &&
                s.expires_at > now() &&
                s.encrypted_embedding,
            )
            .map((s) => ({
              studentId: s.id,
              vector: this.decrypt(s.encrypted_embedding),
            }));
          const matches: {studentId:number;score:number;margin:number}[] = [];
          for (const face of captures)
            matches.push(
              await this.native.call<{studentId:number;score:number;margin:number}>("match", [], {
                vector: face.vector,
                candidates,
              }),
            );
          const match = confirmFaceMatches(matches,config.faceThreshold,config.faceMargin,p.frames.length);
          if (now() >= session.ends) throw Error("La clase terminó durante la identificación");
          const previous = await this.native.call<Row[]>("attendance_list", [
            p.sessionId,
          ]);
          if (previous.some((a) => a.student_id === match.studentId))
            return {
              studentId: match.studentId,
              alreadyRecorded: true,
              message: "Ya se tomó asistencia a este alumno en esta sesión",
            };
          return commit(
            [
              {
                op: "attendance_create",
                params: [
                  p.sessionId,
                  match.studentId,
                  "present",
                  now(),
                  actor.id,
                ],
              },
            ],
            { studentId: match.studentId, status: "present" },
          );
        }
      }
      if (tool === "mcp_grades_tool") {
        if (p.action === "list")
          return this.native.call("grades", [p.offeringId]);
        if (p.action === "preview") {
          const u = this.takeUpload(p.uploadId, actor.id, "xlsx");
          const data = await this.native.call<Row[]>("xlsx", [], {
            path: u.path,
          });
          const enrolled = await this.native.call<Row[]>("enrolled_ids", [
            p.offeringId,
          ]);
          if (
            !data.length ||
            new Set(data.map((x) => x.student_id)).size !== data.length ||
            data.some(
              (x) => !enrolled.some((e) => e.student_id === x.student_id),
            )
          )
            throw Error("Filas duplicadas o estudiantes no inscritos");
          const previewId = randomUUID();
          this.previews.set(previewId, {
            actor: actor.id,
            offering: p.offeringId,
            rows: data,
            expires: now() + 900,
          });
          return { previewId, rows: data };
        }
        if (p.action === "commit") {
          const v = this.previews.get(p.previewId);
          if (!v || v.actor !== actor.id || v.expires < now())
            throw Error("Vista previa vencida");
          const sessions = await this.native.call<Row[]>(
            "schedules",
            [0, 0, 0, 0, 0, 0],
          );
          if (
            sessions.some(
              (s) =>
                s.offering_id === v.offering &&
                !s.cancelled &&
                (!s.closed || s.ends > now()),
            )
          )
            throw Error(
              "Cierra todas las sesiones antes de publicar calificaciones",
            );
          return commit(
            v.rows.map((row) => ({
              op: "grade_create",
              params: [
                row.student_id,
                v.offering,
                row.p1,
                row.p2,
                row.final_exam,
                now(),
                actor.id,
              ],
            })),
            { committed: v.rows.length, offeringId: v.offering },
          );
        }
      }
      if (tool === "mcp_surveys_tool") {
        if (p.action === "create") {
          const steps = [
            { op: "survey_create", params: [actor.id, p.title, now()] },
            ...p.questions.map((q: any) => ({
              op: "question_create",
              params: [
                { $ref: 0 },
                q.prompt,
                q.kind,
                q.options ? JSON.stringify(q.options) : null,
              ],
            })),
          ];
          return commit(steps, null);
        }
        if (p.action === "invite") {
          const links = [];
          const steps = [];
          for (let i = 0; i < p.count; i++) {
            const token = (await import("node:crypto"))
                .randomBytes(32)
                .toString("base64url"),
              respondent = randomUUID();
            steps.push(
              { op: "respondent_create", params: [respondent, p.surveyId, 0] },
              {
                op: "invite_create",
                params: [
                  randomUUID(),
                  p.surveyId,
                  hash(token),
                  now() + 7 * 86400,
                  respondent,
                ],
              },
            );
            links.push(`/responder/${token}`);
          }
          return commit(steps, { links });
        }
        if (p.action === "code")
          return commit(
            [
              {
                op: "code_create",
                params: [p.surveyId, p.parentId, p.label, p.description],
              },
            ],
            { created: true },
          );
        if (p.action === "code_update")
          return commit(
            [
              {
                op: "code_update",
                params: [
                  p.parentId,
                  p.label,
                  p.description,
                  p.codeId,
                  p.surveyId,
                ],
              },
            ],
            { updated: true },
          );
        if (p.action === "review") {
          const [responses, codes] = await Promise.all([
            this.native.call<Row[]>("responses", [p.surveyId]),
            this.native.call<Row[]>("codes", [p.surveyId]),
          ]);
          const response = responses.find((r) => r.id === p.responseId);
          if (
            !response ||
            !codes.some((c) => c.id === p.codeId) ||
            !(response.text ?? response.transcript ?? "").includes(p.quote)
          )
            throw Error("Fragmento o código no válido");
          return commit(
            [
              {
                op: "coding_create",
                params: [
                  p.responseId,
                  p.codeId,
                  p.quote,
                  p.confidence,
                  actor.id,
                ],
              },
            ],
            { reviewed: true },
          );
        }
        if (p.action === "analyze") {
          const metrics = await this.native.call("metrics", [], {
            surveyId: p.surveyId,
          });
          const [responses, codes, coding] = await Promise.all([
            this.native.call<Row[]>("responses", [p.surveyId]),
            this.native.call("codes", [p.surveyId]),
            this.native.call("coding", [p.surveyId]),
          ]);
          let qualitative: string | null = null;
          if (p.qualitative) {
            qualitative = await generate(
              "Eres analista cualitativo. En español, propone temas y sentimientos con citas literales de los fragmentos, distingue casos discrepantes y limitaciones. No inventes citas ni conclusiones causales. Es un borrador para revisión humana.",
              JSON.stringify(
                responses.map((r) => ({
                  id: r.id,
                  text: r.text ?? r.transcript,
                })),
              ),
              signal,
            );
          }
          return { metrics, responses, codes, coding, qualitative };
        }
        if (p.action === "report") {
          const [survey] = await this.native.call<Row[]>("survey", [
            p.surveyId,
          ]);
          const metrics = await this.native.call("metrics", [], {
              surveyId: p.surveyId,
            }),
            coding = await this.native.call("coding", [p.surveyId]);
          return this.export(
            actor,
            `# Investigación mixta: ${survey.title}\n\n## Método\nEncuesta local por invitación, consentimiento y pseudónimos. Métricas descriptivas; códigos revisados por investigador.\n\n## Resultados cuantitativos\n${JSON.stringify(metrics, null, 2)}\n\n## Codificación revisada\n${JSON.stringify(coding, null, 2)}\n\n## Interpretación revisada\n${p.narrative ?? ""}\n\n## Limitaciones\nMuestra por invitación; no representa automáticamente a la población. La IA produce borradores sujetos a revisión.\n`,
            false,
          );
        }
      }
      throw Error("Acción no implementada");
    });
  }
  async frame(data: string) {
    const m = data.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw Error("Se requiere una imagen JPEG");
    const bytes = Buffer.from(m[1], "base64");
    if (
      bytes.length < 100 ||
      bytes.length > 1500000 ||
      bytes[0] !== 255 ||
      bytes[1] !== 216
    )
      throw Error("Imagen inválida");
    const path = resolve(config.uploads, `${randomUUID()}.jpg`);
    await mkdir(config.uploads, { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
    return path;
  }
  async faceVersion() {
    return (
      "arcface:" +
      createHash("sha256")
        .update(await readFile(config.recognizer))
        .digest("hex")
    );
  }
  key() {
    const key = Buffer.from(process.env.BIOMETRIC_KEY ?? "", "hex");
    if (key.length !== 32)
      throw Error("Configura BIOMETRIC_KEY antes de usar biometría");
    return key;
  }
  encrypt(vector: number[]) {
    const iv = awaitCryptoRandom(12),
      cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(vector)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
  }
  decrypt(text: string) {
    const data = Buffer.from(text, "base64"),
      cipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        data.subarray(0, 12),
      );
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        cipher.update(data.subarray(28)),
        cipher.final(),
      ]).toString(),
    ) as number[];
  }
  async export(
    actor: Principal,
    text: string,
    notebook: boolean,
    kind = "finance",
  ) {
    await mkdir(config.artifacts, { recursive: true });
    const id = randomUUID();
    const files = await this.native.call<Row>("generate", [], {
      base: resolve(config.artifacts, id),
      text,
      notebook,
      kind,
    });
    await this.native.call("artifact_create", [id, actor.id, now()]);
    return {
      markdown: text,
      files: Object.fromEntries(
        Object.entries(files).map(([k, v]) => [
          k,
          `/api/artifacts/${basename(v)}`,
        ]),
      ),
    };
  }
  async references(query: string, signal: AbortSignal) {
    if (!config.allowWeb)
      throw Error("Activa ALLOW_WEB_REFERENCES para consultar Crossref");
    const url = new URL("https://api.crossref.org/works");
    url.searchParams.set("query.bibliographic", query);
    url.searchParams.set("rows", "3");
    const r = await fetch(url, {
      signal,
      headers: {
        "User-Agent":
          "SistemaEscolar/0.2 (local academic reference verification)",
      },
    });
    if (!r.ok) throw Error("No se pudieron verificar referencias");
    const data = (await r.json()) as any;
    const result = (data.message?.items ?? [])
      .filter((x: any) => x.DOI && x.title?.[0] && x.author?.length)
      .map((x: any) => {
        const names = x.author.map((a: any) =>
          a.family
            ? `${a.family}, ${(a.given ?? "")
                .split(/\s+/)
                .filter(Boolean)
                .map((n: string) => n[0] + ".")
                .join(" ")}`
            : (a.name ?? ""),
        );
        const authors =
          names.length > 20
            ? [...names.slice(0, 19), "…", names.at(-1)].join(", ")
            : names.length > 1
              ? names.slice(0, -1).join(", ") + ", & " + names.at(-1)
              : names[0];
        const year = x.published?.["date-parts"]?.[0]?.[0] ?? "s. f.";
        return `${authors} (${year}). ${x.title[0]}. ${x["container-title"]?.[0] ?? ""}${x.volume ? ", " + x.volume : ""}${x.issue ? "(" + x.issue + ")" : ""}${x.page ? ", " + x.page : ""}. https://doi.org/${x.DOI} [Metadatos verificados en Crossref; revisar formato APA].`;
      });
    if (!result.length)
      throw Error(
        "No se encontraron referencias con autores y DOI verificables",
      );
    return result;
  }
  async submit(raw: unknown) {
    const { submission } = await import("./schemas.js");
    const p = submission.parse(raw),
      tokenHash = hash(p.token);
    const [invite] = await this.native.call<Row[]>("invite_lookup", [
      tokenHash,
      now(),
    ]);
    if (!invite) throw Error("Invitación vencida");
    const questions = await this.native.call<Row[]>("questions", [
      invite.survey_id,
    ]);
    if (
      new Set(p.answers.map((a) => a.questionId)).size !== p.answers.length ||
      p.answers.length !== questions.length
    )
      throw Error("Responde todas las preguntas una vez");
    const steps = [
      { op: "respondent_consent", params: [now(), invite.respondent_id] },
    ];
    for (const a of p.answers) {
      const q = questions.find((q) => q.id === a.questionId);
      if (!q) throw Error("Pregunta de otra encuesta");
      let text = a.text ?? null,
        rating = a.rating ?? null,
        transcript: string | null = null;
      if (q.kind === "rating" && rating === null)
        throw Error("Falta la calificación");
      if (
        q.kind === "choice" &&
        !JSON.parse(q.options_json ?? "[]").includes(text)
      )
        throw Error("Opción inválida");
      if (q.kind === "text" && !text?.trim()) throw Error("Falta la respuesta");
      if (q.kind === "audio") {
        if (!a.uploadId) throw Error("Falta el audio");
        const u = this.takeUpload(a.uploadId, tokenHash, "audio");
        transcript = await transcribe(u.path, AbortSignal.timeout(120000));
        text = transcript;
      }
      steps.push({
        op: "response_create",
        params: [
          invite.respondent_id,
          a.questionId,
          text,
          rating,
          null,
          now(),
          transcript,
        ],
      });
    }
    steps.push({
      op: "respondent_complete",
      params: [now(), invite.respondent_id],
    });
    await this.native.batch(steps);
    return { completed: true };
  }
}
import { randomBytes as awaitCryptoRandom } from "node:crypto";
