import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { Native, type Row } from "./native.js";
import { type Principal } from "./contracts.js";
const home = resolve(config.root, "../second-brain");
const rowSchema = z.record(z.string().max(300));
export async function importWorker(args: unknown) {
  return new Promise<any>((ok, fail) => {
    const p = spawn(
      resolve(home, ".venv/bin/python"),
      ["-m", "second_brain.academic_import"],
      {
        cwd: home,
        env: { ...process.env, PYTHONPATH: resolve(home, "src") },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "",
      error = "";
    const timer = setTimeout(() => {
      p.kill();
      fail(Error("La lectura del archivo agotó el tiempo"));
    }, 45000);
    p.stdout.on("data", (b) => {
      output += b;
      if (output.length > 2000000) p.kill();
    });
    p.stderr.on("data", (b) => (error += b));
    p.on("error", (e) => {
      clearTimeout(timer);
      fail(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      try {
        const v = JSON.parse(output);
        if (code || v.error) fail(Error(v.error || error.slice(-500)));
        else ok(v);
      } catch {
        fail(Error("No se pudo leer el archivo: " + error.slice(-500)));
      }
    });
    p.stdin.end(JSON.stringify(args));
  });
}
export async function commitImport(
  native: Native,
  actor: Principal,
  args: any,
  file: { path: string; kind: string },
) {
  const b = z
    .object({
      extension: z.enum(["csv", "xls", "xlsx", "pdf"]),
      kind: z.enum(["lista", "horario"]),
      name: z.string().min(1).max(200),
      teacherId: z.number().int().positive(),
      offeringId: z.number().int().positive().optional(),
      rows: z.array(rowSchema).min(1).max(1000),
    })
    .parse(args);
  if (!actor.roles.includes("admin")) throw Error("Se requiere administración");
  const teachers = await native.call<Row[]>("teachers");
  const teacher = teachers.find((t) => t.id === b.teacherId);
  if (!teacher) throw Error("Docente inexistente");
  const offerings = await native.call<Row[]>("offerings");
  const steps: { op: string; params: unknown[] }[] = [];
  const records: Row[] = [];
  if (b.kind === "lista") {
    const offer = offerings.find(
      (o) => o.id === b.offeringId && o.teacher_id === b.teacherId,
    );
    if (!offer) throw Error("Selecciona un grupo/materia de este docente");
    const students = await native.call<Row[]>("students");
    const enrolled = await native.call<Row[]>("enrolled_ids", [offer.id]);
    const seen = new Set<string>();
    for (const [i, r] of b.rows.entries()) {
      if (!r.matricula?.trim() || !r.nombre?.trim())
        throw Error(`Fila ${i + 1}: matrícula y nombre obligatorios`);
      if (seen.has(r.matricula))
        throw Error(`Matrícula repetida: ${r.matricula}`);
      seen.add(r.matricula);
      const existing = students.find((s) => s.number === r.matricula);
      let studentId: unknown = existing?.id;
      if (!existing) {
        studentId = { $ref: steps.length };
        steps.push({
          op: "student_create",
          params: [r.matricula, r.nombre, null],
        });
      }
      if (!existing || !enrolled.some((e) => e.student_id === existing.id))
        steps.push({ op: "enroll", params: [studentId, offer.id] });
      records.push({
        matricula: r.matricula,
        nombre: existing?.name || r.nombre,
        grupo: offer.group_code,
        materia: offer.subject,
        oferta: offer.id,
      });
    }
  } else {
    const subjects = await native.call<Row[]>("subjects", ["", "", ""]);
    const groups = await native.call<Row[]>("groups");
    const rooms = await native.call<Row[]>("rooms");
    const schedules = await native.call<Row[]>("schedules", [0, 0, 0, 0, 0, 0]);
    const seen = new Set<string>();
    for (const [i, r] of b.rows.entries()) {
      const subject = subjects.find((s) => s.code === r.materia?.toUpperCase());
      const group = groups.find((g) => g.code === r.grupo);
      const room = rooms.find((a) => a.name === r.aula);
      const offer = offerings.find(
        (o) =>
          o.subject_id === subject?.id &&
          o.group_id === group?.id &&
          o.teacher_id === b.teacherId,
      );
      if (!subject || !group || !room || !offer)
        throw Error(
          `Fila ${i + 1}: verifica clave de materia, grupo, aula y asignación del docente`,
        );
      const iso =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/;
      if (!iso.test(r.inicio || "") || !iso.test(r.fin || ""))
        throw Error(
          `Fila ${i + 1}: usa fecha ISO, ejemplo 2026-10-12T08:00:00-06:00`,
        );
      const start = Date.parse(r.inicio) / 1000,
        end = Date.parse(r.fin) / 1000;
      if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start)
        throw Error(`Fila ${i + 1}: fechas inválidas`);
      const key = JSON.stringify([offer.id, room.id, start, end]);
      if (seen.has(key)) throw Error(`Fila ${i + 1}: sesión repetida`);
      seen.add(key);
      if (
        !schedules.some(
          (s) =>
            !s.cancelled &&
            s.offering_id === offer.id &&
            s.room_id === room.id &&
            s.starts === start &&
            s.ends === end,
        )
      )
        steps.push({
          op: "schedule_create",
          params: [offer.id, room.id, start, end],
        });
      records.push({
        materia: subject.code,
        nombre: subject.name,
        grupo: group.code,
        aula: room.name,
        inicio: r.inicio,
        fin: r.fin,
      });
    }
  }
  const operation =
    "import:" +
    createHash("sha256")
      .update(JSON.stringify([b, file.path]))
      .digest("hex");
  const rid = createHash("sha256").update(operation).digest("hex");
  const previous = await native.call<Row[]>("operation", [
    rid,
    actor.id,
    operation,
  ]);
  if (!previous.length) {
    steps.push({
      op: "audit_create",
      params: [
        actor.id,
        "import_" + b.kind,
        randomUUID(),
        Math.floor(Date.now() / 1000),
        JSON.stringify({ filas: records.length, fuente: b.name }),
      ],
    });
    steps.push({
      op: "operation_create",
      params: [
        rid,
        actor.id,
        operation,
        JSON.stringify({ registered: records.length }),
        Math.floor(Date.now() / 1000),
      ],
    });
    await native.batch(steps);
  }
  try {
    const rag = await importWorker({
      action: "archive",
      path: file.path,
      extension: b.extension,
      kind: b.kind,
      name: b.name,
      records,
      context: { docente: teacher.name, docente_id: teacher.id },
      home: process.env.ACADEMIC_RAG_HOME || home,
    });
    return {
      registered: records.length,
      rag,
      message: "Datos registrados e incorporados al RAG",
    };
  } catch (e) {
    return {
      registered: records.length,
      rag_pending: true,
      message:
        "Datos registrados; incorporación RAG pendiente. Reintenta el mismo archivo sin modificar las filas. " +
        String(e),
    };
  }
}
