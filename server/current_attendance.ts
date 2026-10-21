import { resolve } from "node:path";
import { config } from "./config.js";
import { Native, type Row } from "./native.js";
import { importWorker } from "./academic_import.js";
let chain = Promise.resolve();
export function ensureCurrent(native: Native, teacherId: number, offeringId?: number, worker = importWorker) {
  const task = chain.then(async () => {
    const blocks = await worker({
      action: "current_weekly",
      teacherId,
      timestamp: Date.now() / 1000,
      home:
        process.env.ACADEMIC_RAG_HOME ||
        resolve(config.root, "../second-brain"),
    });
    if (!blocks.length)
      return {
        active: [],
        message: "No hay una clase en el horario actual de la máquina",
      };
    if (offeringId && blocks.length !== 1) throw Error("El horario contiene clases simultáneas; corrige el horario antes de registrar asistencia");
    const subjects = await native.call<Row[]>("subjects", ["", "", ""]);
    const groups = await native.call<Row[]>("groups");
    const offers = await native.call<Row[]>("offerings");
    const schedules = await native.call<Row[]>("schedules", [
      teacherId,
      teacherId,
      0,
      0,
      0,
      0,
    ]);
    const candidates: Row[] = [];
    let rooms = offeringId ? await native.call<Row[]>("rooms") : [];
    let internal = rooms.find(
      (r) => r.name === `Registro de asistencia (docente ${teacherId})`,
    );
    const active = [];
    for (const block of blocks) {
      const subject = subjects.find((s) => s.code === block.materia);
      const group = groups.find((g) => g.code === block.grupo);
      const offer = offers.find(
        (o) =>
          o.teacher_id === teacherId &&
          o.subject_id === subject?.id &&
          o.group_id === group?.id &&
          o.term === block.periodo,
      );
      if (!offer)
        throw Error(
          "La clase actual no tiene asignación docente/grupo/materia",
        );
      candidates.push({ ...block, offering_id: offer.id, group_code: group!.code, subject: subject!.name });
      if (!offeringId) continue;
      const chosen = offers.find(o => o.id === offeringId && o.teacher_id === teacherId && o.term === block.periodo);
      if (!chosen) throw Error("El grupo elegido no pertenece al docente y período actuales");
      const existing = schedules.find(
        (s) =>
          s.offering_id === chosen.id &&
          s.starts === block.starts &&
          s.ends === block.ends,
      );
      if (existing) {
        if (!existing.cancelled && !existing.closed) active.push(existing.id);
        continue;
      }
      if (!internal) {
        const result = await native.call("room_create", [
          `Registro de asistencia (docente ${teacherId})`,
          1000,
        ]);
        internal = { id: result.id };
      }
      const result = await native.call("schedule_create", [
        chosen.id,
        internal.id,
        block.starts,
        block.ends,
      ]);
      active.push(result.id);
    }
    return {
      active,
      candidates,
      message: active.length
        ? "Clase confirmada para asistencia"
        : candidates.length ? "Confirma el grupo sugerido por el horario" : "La clase ya está cerrada o cancelada",
    };
  });
  chain = task.then(
    () => {},
    () => {},
  );
  return task;
}
