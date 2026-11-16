import { useEffect, useState } from "react";
import { request } from "../api";
import type { Row } from "../lib/shared";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Alta de bloques de clase propios (día, hora, aula) sobre grupos y materias asignados por administración. */
export function MyBlocks() {
  const [offers, setOffers] = useState<Row[]>([]), [rooms, setRooms] = useState<Row[]>([]), [msg, setMsg] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ offeringId: 0, roomId: 0, weekday: 1, start: "07:00", end: "09:00", from: new Date().toISOString().slice(0, 10), weeks: 16 });
  useEffect(() => {
    void Promise.all([request("offerings/mine"), request("schedules/rooms")]).then(([o, r]) => {
      setOffers(o); setRooms(r); setF((v) => ({ ...v, offeringId: o[0]?.id ?? 0, roomId: r[0]?.id ?? 0 }));
    }).catch((e) => setErr(e.message));
  }, []);
  return (
    <form className="my-blocks" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(""); setMsg("");
      try { setMsg((await request("schedules/block", f)).message); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
    }}>
      <h2>Mis bloques de clase</h2>
      <p className="muted">Solo puedes usar los grupos y materias que administración te asignó. Si el aula, el grupo o tú ya tienen clase en ese horario, no se crea ninguna sesión.</p>
      {!offers.length && !err && <p className="muted">No tienes grupos asignados todavía.</p>}
      <div className="actions">
        <label>Grupo / materia <select value={f.offeringId} onChange={(e) => setF({ ...f, offeringId: Number(e.target.value) })}>{offers.map((o) => <option key={o.id} value={o.id}>{o.group_code} · {o.subject} · {o.term}</option>)}</select></label>
        <label>Aula <select value={f.roomId} onChange={(e) => setF({ ...f, roomId: Number(e.target.value) })}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        <label>Día <select value={f.weekday} onChange={(e) => setF({ ...f, weekday: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>
        <label>Inicio <input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label>Fin <input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <label>Desde <input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>Semanas <input type="number" min={1} max={20} value={f.weeks} onChange={(e) => setF({ ...f, weeks: Number(e.target.value) })} style={{ width: 64 }} /></label>
      </div>
      <button disabled={busy || !f.offeringId || !f.roomId}>{busy ? "Creando…" : "Crear bloque semanal"}</button>
      {msg && <p role="status">{msg}</p>}
      {err && <p role="alert" className="error">{err}</p>}
    </form>
  );
}
