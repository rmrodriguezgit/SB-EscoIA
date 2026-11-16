import { useEffect, useState } from "react";
import { request } from "../api";
import type { Row } from "../lib/shared";

const LABEL: Record<string, string> = { present: "P", late: "R", excused: "J", absent: "F" };
const NAME: Record<string, string> = { present: "Presente", late: "Retardo", excused: "Justificada", absent: "Falta" };
const day = (t: number) => new Date(t * 1000).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: "America/Mexico_City" });
const time = (t: number) => new Date(t * 1000).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

/** Calificaciones · fase 1: control histórico de asistencia (fechas × alumnos) con edición justificada. */
export function AttendanceHistory() {
  const [offers, setOffers] = useState<Row[]>([]), [offering, setOffering] = useState<number | null>(null), [threshold, setThreshold] = useState(80);
  const [data, setData] = useState<Row | null>(null), [error, setError] = useState(""), [edit, setEdit] = useState<{ student: Row; session: Row } | null>(null);
  const [status, setStatus] = useState("present"), [note, setNote] = useState(""), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  useEffect(() => { void request("offerings/mine").then((o: Row[]) => { setOffers(o); if (o[0]) setOffering(o[0].id); }).catch((e) => setError(String(e.message ?? e))); }, []);
  async function load(id = offering) {
    if (!id) return;
    try { setData(await request(`attendance/history?offering=${id}&threshold=${threshold}`)); setError(""); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, [offering, threshold]);
  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      const r = await request("attendance/set", { sessionId: edit.session.id, studentId: edit.student.id, status, note });
      setMessage(r.message); setEdit(null); setNote(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }
  const sessions: Row[] = data?.sessions ?? [];
  function csv() {
    const head = ["Matrícula", "Nombre", ...sessions.map((s) => `${day(s.starts)} ${time(s.starts)}`), "Presentes", "Retardos", "Justificadas", "Faltas", "% asistencia", "Riesgo"];
    const lines = (data?.students ?? []).map((st: Row) => [st.number, st.name, ...sessions.map((s) => (s.cancelled ? "C" : LABEL[st.cells[s.id]?.status] ?? (s.past ? "F" : ""))), st.stats.present, st.stats.late, st.stats.excused, st.stats.absent, st.stats.pct ?? "", st.stats.risk ? "Sí" : "No"]);
    const text = [head, ...lines].map((r: unknown[]) => r.map((v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    a.download = `asistencia-${data?.offering.group}-${data?.offering.subject}.csv`.replace(/[^\w.-]+/g, "_");
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const atRisk = (data?.students ?? []).filter((s: Row) => s.stats.risk).length;
  return (
    <section className="attendance-history">
      <h2>Control de asistencia · historial por grupo</h2>
      <div className="actions no-print">
        <label>Grupo / materia{" "}
          <select value={offering ?? ""} onChange={(e) => setOffering(Number(e.target.value))}>
            {offers.map((o) => <option key={o.id} value={o.id}>{o.group_code} · {o.subject} · {o.term}</option>)}
          </select>
        </label>
        <label>Mínimo de asistencia{" "}
          <input type="number" min={50} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} style={{ width: 64 }} /> %
        </label>
        <button className="secondary" disabled={!data} onClick={csv}>Exportar CSV</button>
        <button className="secondary" disabled={!data} onClick={() => window.print()}>Imprimir / PDF</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!offers.length && !error && <p className="muted">No tienes grupos asignados todavía.</p>}
      {data && (
        <>
          <p className="print-only"><b>{data.offering.subject}</b> · Grupo {data.offering.group} · {data.offering.term} · Docente: {data.offering.teacher}</p>
          <p className="muted">{data.note} {atRisk > 0 && <b className="risk-text">{atRisk} alumno(s) por debajo del {data.threshold}%.</b>}</p>
          <div className="matrix-wrap">
            <table className="attendance-matrix">
              <thead>
                <tr><th>Alumno</th>{sessions.map((s) => <th key={s.id} title={`${day(s.starts)} ${time(s.starts)}–${time(s.ends)}`}>{day(s.starts)}<small>{time(s.starts)}</small></th>)}<th>%</th></tr>
              </thead>
              <tbody>
                {data.students.map((st: Row) => (
                  <tr key={st.id} className={st.stats.risk ? "risk" : ""}>
                    <th scope="row">{st.name}<small>{st.number}</small></th>
                    {sessions.map((s) => {
                      const c = st.cells[s.id] ?? {}, value = s.cancelled ? "C" : LABEL[c.status] ?? (s.past ? "F" : "·");
                      return (
                        <td key={s.id} className={"cell-" + (s.cancelled ? "cancelled" : c.status ?? (s.past ? "absent unrecorded" : "future"))} title={[s.cancelled ? "Cancelada" : NAME[c.status] ?? (s.past ? "Sin registro (falta)" : "Pendiente"), c.note ? "Nota: " + c.note : "", c.confidence ? `Confianza facial ${(c.confidence * 100).toFixed(0)}%` : ""].filter(Boolean).join(" · ")}>
                          <button disabled={!s.past || s.cancelled} onClick={() => { setEdit({ student: st, session: s }); setStatus(c.status ?? "present"); setNote(""); }} aria-label={`Editar asistencia de ${st.name} el ${day(s.starts)}`}>{value}{c.note ? "*" : ""}</button>
                        </td>
                      );
                    })}
                    <td className="pct">{st.stats.pct ?? "—"}{st.stats.pct !== null && "%"}{st.stats.risk && <span className="risk-badge" title="Riesgo de reprobación por faltas"> ⚠</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted legend">P presente · R retardo (cuenta como asistencia) · J justificada · F falta · C cancelada · * editada con justificación</p>
        </>
      )}
      {edit && (
        <div className="edit-dialog no-print" role="dialog" aria-label="Editar asistencia">
          <p><b>{edit.student.name}</b> · {day(edit.session.starts)} {time(edit.session.starts)}</p>
          <div className="actions">{Object.keys(NAME).map((k) => <label key={k}><input type="radio" name="st" checked={status === k} onChange={() => setStatus(k)} /> {NAME[k]}</label>)}</div>
          <label>Justificación (obligatoria, queda en auditoría)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="actions">
            <button disabled={saving || note.trim().length < 5} onClick={() => void save()}>Guardar</button>
            <button className="secondary" onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </section>
  );
}
