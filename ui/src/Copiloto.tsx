import { useEffect, useState } from "react";

type Post = (path: string, v: any) => Promise<any>;
type Subject = { code: string; name: string; career: string; semester: number };
const KINDS: [string, string][] = [["ejemplo", "Ejemplo práctico"], ["codigo", "Código ejecutable"], ["ejercicio", "Ejercicio guiado"], ["caso", "Caso de estudio"], ["explicacion", "Explicación didáctica"]];
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d.toISOString().slice(0, 10); };
const download = (name: string, text: string, type: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); };

/** Copiloto pedagógico: temario oficial, planeación de 16 semanas y recursos de clase. */
export function Copiloto({ post, onBusy }: { post: Post; onBusy: (b: boolean) => void }) {
  const [subjects, setSubjects] = useState<{ mine: Subject[]; found: Subject[]; academic_available: boolean } | null>(null), [query, setQuery] = useState("");
  const [code, setCode] = useState(""), [syllabus, setSyllabus] = useState<any>(null), [start, setStart] = useState(nextMonday()), [plan, setPlan] = useState<any>(null);
  const [resource, setResource] = useState<any>(null), [busy, setBusy] = useState(""), [err, setErr] = useState(""), [searched, setSearched] = useState("");
  async function call(label: string, body: any) {
    setBusy(label); onBusy(true); setErr("");
    try { return await post("copilot", body); } catch (e) { setErr((e as Error).message); return null; } finally { setBusy(""); onBusy(false); }
  }
  useEffect(() => { void call("Cargando materias…", { action: "subjects" }).then((r) => { if (r) { setSubjects(r); if (r.mine[0]) setCode(r.mine[0].code); } }); }, []);
  useEffect(() => { if (code) { setPlan(null); setResource(null); void call("Leyendo el programa oficial…", { action: "syllabus", code }).then((r) => r && setSyllabus(r)); } }, [code]);
  const options = [...(subjects?.mine || []), ...(subjects?.found || []).filter((f) => !subjects?.mine.some((m) => m.code === f.code))];
  function markdown() {
    return `# Planeación 16 semanas · ${plan.subject.name} (${plan.subject.code})\n\nObjetivo oficial: ${plan.subject.objective}\n\nFuente: ${plan.subject.citation}\n\n| Semana | Fechas | Unidad | Subtemas | Objetivo | Actividades | Entregable |\n|---|---|---|---|---|---|---|\n` +
      plan.weeks.map((w: any) => `| ${w.week} | ${w.from} – ${w.to} | ${w.unit} | ${w.topics.join("; ")} | ${w.objective} | ${w.activities} | ${w.deliverable} |`).join("\n") + `\n\n_${plan.note}_\n`;
  }
  return (
    <section className="copiloto">
      <div className="page-heading">
        <span className="eyebrow">COPILOTO PEDAGÓGICO · RAG ACADÉMICO</span>
        <h1>Del programa oficial a tu clase.</h1>
        <p>Temario oficial de tus materias, planeación didáctica de 16 semanas y recursos de clase en un clic. Todo parte del programa en la biblioteca.</p>
      </div>
      <div className="inv-card">
        <div className="inv-row">
          <label>Materia
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              <option value="">Elige una materia</option>
              {subjects?.mine.length ? <optgroup label="Mis materias">{subjects.mine.map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</optgroup> : null}
              {subjects?.found.length ? <optgroup label="Resultados de búsqueda">{options.filter((o) => !subjects.mine.some((m) => m.code === o.code)).map((s) => <option key={s.code} value={s.code}>{s.code} · {s.name}</option>)}</optgroup> : null}
            </select>
          </label>
          <form className="inv-row" onSubmit={(e) => {
            e.preventDefault();
            void call("Buscando…", { action: "subjects", query }).then((r) => {
              if (!r) return;
              setSubjects(r); setSearched(query.trim());
              // Clave exacta o un único resultado: se abre directamente esa materia.
              const exact = r.found.find((f: Subject) => f.code.toUpperCase() === query.trim().toUpperCase());
              const pick = exact ?? (r.found.length === 1 ? r.found[0] : null);
              if (pick) setCode(pick.code);
            });
          }}>
            <label>Buscar otra materia<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o clave" /></label>
            <button className="secondary" disabled={!query.trim()}>Buscar</button>
          </form>
        </div>
        {searched && subjects && (subjects.found.length === 0
          ? <p className="inv-warn" role="status">Sin programas oficiales para «{searched}». Revisa la clave o busca por nombre.</p>
          : subjects.found.length > 1 && <div className="copilot-found" role="status"><span className="muted">{subjects.found.length} resultados para «{searched}»:</span>{subjects.found.map((f) => <button key={f.code} type="button" className={"chip" + (f.code === code ? " on" : "")} onClick={() => setCode(f.code)}>{f.code} · {f.name}</button>)}</div>)}
        {subjects && !subjects.academic_available && <p className="inv-warn">El servicio académico no responde: no se pueden identificar tus materias asignadas; usa la búsqueda.</p>}
        {subjects?.academic_available && !subjects.mine.length && <p className="muted">No hay programas oficiales que coincidan con tus grupos asignados; usa la búsqueda.</p>}
        {busy && <p role="status" className="muted">{busy}</p>}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
      {syllabus && (
        <div className="inv-grid">
          <div className="inv-card">
            <h2>Temario oficial · {syllabus.name}</h2>
            <p className="muted">{syllabus.code} · semestre {syllabus.semester} · HC {syllabus.hours.hc} / HI {syllabus.hours.hi} · {syllabus.hours.creditos} créditos · Fuente: {syllabus.citation}</p>
            <p>{syllabus.objective}</p>
            {syllabus.units.map((u: any) => <details key={u.numero}><summary>Unidad {u.numero} · {u.titulo}</summary><ul>{u.temas.map((t: string) => <li key={t}>{t}</li>)}</ul></details>)}
            {syllabus.evaluation.length > 0 && <p><b>Evaluación oficial:</b> {syllabus.evaluation.join(" · ")}</p>}
          </div>
          <form className="inv-card" onSubmit={(e) => { e.preventDefault(); void call("Generando la planeación…", { action: "plan", code, start }).then((r) => r && setPlan(r)); }}>
            <h2>Planeación didáctica de 16 semanas</h2>
            <label>Inicio del semestre<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <button disabled={!!busy}>Generar planeación</button>
            <p className="muted">Reparte unidades y subtemas del programa oficial en su orden. Reserva la semana 1 para encuadre, la 8 para evaluación parcial y la 16 para evaluación final.</p>
          </form>
        </div>
      )}
      {plan && (
        <div className="inv-card">
          <div className="lib-head"><h2>Planeación · {plan.subject.name}</h2>
            <div className="actions">
              <button className="secondary" onClick={() => download(`planeacion-${plan.subject.code}.md`, markdown(), "text/markdown")}>Descargar Markdown</button>
              <button className="secondary" onClick={() => download(`planeacion-${plan.subject.code}.csv`, "﻿" + [["Semana", "Desde", "Hasta", "Unidad", "Subtemas", "Objetivo", "Actividades", "Entregable"], ...plan.weeks.map((w: any) => [w.week, w.from, w.to, w.unit, w.topics.join("; "), w.objective, w.activities, w.deliverable])].map((r: any[]) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n"), "text/csv")}>CSV</button>
            </div>
          </div>
          <p className="muted">{plan.note}</p>
          <div className="inv-table-wrap"><table className="inv-table plan-table">
            <thead><tr><th>Sem.</th><th>Fechas</th><th>Unidad y subtemas</th><th>Objetivo</th><th>Actividades / entregable</th><th>Recursos</th></tr></thead>
            <tbody>{plan.weeks.map((w: any) => (
              <tr key={w.week}>
                <td>{w.week}</td><td>{w.from}<br />{w.to}</td>
                <td><b>{w.unit}</b><ul>{w.topics.map((t: string) => <li key={t}>{t}</li>)}</ul></td>
                <td>{w.objective}</td><td>{w.activities}<br /><small>Entregable: {w.deliverable}</small></td>
                <td>{![1, 8, 16].includes(w.week) && <div className="plan-kinds">{KINDS.map(([k, l]) => <button key={k} className="chip" disabled={!!busy} onClick={() => void call(`Generando «${l}» con el modelo local…`, { action: "resource", code, topic: w.topics[0], kind: k }).then((r) => r && setResource({ ...r, week: w.week }))}>{l}</button>)}</div>}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}
      {resource && (
        <div className="inv-card copilot-resource">
          <div className="lib-head"><h2>{resource.label} · semana {resource.week}</h2>
            <div className="actions"><button className="secondary" onClick={() => download(`recurso-s${resource.week}-${resource.kind}.md`, resource.markdown, "text/markdown")}>Descargar</button><button className="secondary" onClick={() => void navigator.clipboard?.writeText(resource.markdown)}>Copiar</button><button className="text-button" onClick={() => setResource(null)}>Cerrar ✕</button></div>
          </div>
          <p className="muted">Tema oficial: {resource.topic} · {resource.engine} · {resource.note}</p>
          <pre className="copilot-md">{resource.markdown}</pre>
        </div>
      )}
    </section>
  );
}
