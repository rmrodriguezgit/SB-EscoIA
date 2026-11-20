import { useEffect, useState } from "react";
import { ResearchDashboard } from "./ResearchDashboard";

type Post = (path: string, v: any) => Promise<any>;
const TESTS: [string, string, string][] = [
  ["t_one", "t de Student · una muestra", "Paramétricas"],
  ["t_ind", "t de Student · independientes", "Paramétricas"],
  ["welch", "t de Welch · independientes", "Paramétricas"],
  ["t_paired", "t de Student · pareadas", "Paramétricas"],
  ["anova", "ANOVA de un factor", "Paramétricas"],
  ["pearson", "Correlación de Pearson", "Paramétricas"],
  ["regression", "Regresión lineal simple", "Paramétricas"],
  ["mannwhitney", "U de Mann-Whitney", "No paramétricas"],
  ["wilcoxon", "Wilcoxon (rangos con signo)", "No paramétricas"],
  ["kruskal", "Kruskal-Wallis", "No paramétricas"],
  ["spearman", "Correlación de Spearman", "No paramétricas"],
  ["chi2_ind", "χ² de independencia", "No paramétricas"],
  ["chi2_gof", "χ² de bondad de ajuste", "No paramétricas"],
];
const shape = (t: string) =>
  t === "t_one" ? "one" : ["t_ind", "welch", "mannwhitney", "anova", "kruskal"].includes(t) ? "groups" : t === "chi2_ind" ? "table" : t === "chi2_gof" ? "gof" : "xy";
const nums = (s: string) => s.split(/[\s,;]+/).map((v) => v.trim()).filter(Boolean).map(Number);
const fmt = (v: any, d = 4) => (typeof v === "number" ? (Math.abs(v) < 1e-4 && v !== 0 ? v.toExponential(2) : v.toFixed(d)) : Array.isArray(v) ? v.join(", ") : v ?? "—");

export function Investigaciones({ post, onBusy }: { post: Post; onBusy: (b: boolean) => void }) {
  const [tab, setTab] = useState("lab"), [last, setLast] = useState<any>(null);
  return (
    <section className="investigaciones">
      <div className="page-heading">
        <span className="eyebrow">INVESTIGACIONES · MÉTODOS MIXTOS</span>
        <h1>Investigaciones</h1>
        <p>Cada docente administra solo sus investigaciones. Los datos y el análisis se quedan en este Mac.</p>
      </div>
      <div className="inv-tabs" role="tablist">
        {[["lab", "Pruebas de hipótesis"], ["qual", "Cualitativo · Izcara Palacios"], ["mixed", "Estudios con encuesta"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "lab" && <StatLab post={post} onBusy={onBusy} onResult={setLast} />}
      {tab === "qual" && <Qualitative post={post} onBusy={onBusy} last={last} />}
      {tab === "mixed" && <ResearchDashboard post={post} onBusy={onBusy} />}
    </section>
  );
}

function StatLab({ post, onBusy, onResult }: { post: Post; onBusy: (b: boolean) => void; onResult: (r: any) => void }) {
  const [test, setTest] = useState("t_ind"), [alpha, setAlpha] = useState(0.05), [alt, setAlt] = useState("two-sided");
  const [x, setX] = useState(""), [y, setY] = useState(""), [mu, setMu] = useState("0"), [groups, setGroups] = useState("Grupo A: \nGrupo B: "), [table, setTable] = useState("20 15\n10 25"), [expected, setExpected] = useState("");
  const [result, setResult] = useState<any>(null), [prose, setProse] = useState<any>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const kind = shape(test);
  function input() {
    const base: any = { test, alpha, alternative: alt };
    if (kind === "one") return { ...base, x: nums(x), mu: Number(mu) };
    if (kind === "xy") return { ...base, x: nums(x), y: nums(y) };
    if (kind === "groups") return { ...base, groups: Object.fromEntries(groups.split("\n").filter((l) => l.includes(":")).map((l) => [l.split(":")[0].trim(), nums(l.split(":").slice(1).join(":"))]).filter(([, v]) => (v as number[]).length)) };
    if (kind === "table") return { ...base, table: table.split("\n").filter((l) => l.trim()).map(nums) };
    return { ...base, observed: nums(x), ...(expected.trim() ? { expected: nums(expected) } : {}) };
  }
  async function run(action: "stat_test" | "interpret") {
    setBusy(true); onBusy(true); setErr("");
    try {
      if (action === "stat_test") { const r = await post("research", { action, test_input: input() }); setResult(r); setProse(null); onResult(r); }
      else setProse(await post("research", { action, result }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); onBusy(false); }
  }
  return (
    <div className="inv-grid">
      <form className="inv-card" onSubmit={(e) => { e.preventDefault(); void run("stat_test"); }}>
        <h2>Prueba de hipótesis</h2>
        <label>Prueba
          <select value={test} onChange={(e) => { setTest(e.target.value); setResult(null); }}>
            {["Paramétricas", "No paramétricas"].map((g) => <optgroup key={g} label={g}>{TESTS.filter((t) => t[2] === g).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
          </select>
        </label>
        <div className="inv-row">
          <label>α <input type="number" step="0.01" min="0.001" max="0.2" value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} /></label>
          {!kind.startsWith("table") && kind !== "gof" && (
            <label>H1
              <select value={alt} onChange={(e) => setAlt(e.target.value)}>
                <option value="two-sided">Bilateral (≠)</option><option value="greater">Mayor (&gt;)</option><option value="less">Menor (&lt;)</option>
              </select>
            </label>
          )}
          {kind === "one" && <label>μ₀ <input type="number" value={mu} onChange={(e) => setMu(e.target.value)} /></label>}
        </div>
        {(kind === "one" || kind === "xy" || kind === "gof") && <label>{kind === "gof" ? "Frecuencias observadas" : kind === "one" ? "Datos" : test === "regression" ? "X (predictor)" : "X / antes"}<textarea rows={3} value={x} onChange={(e) => setX(e.target.value)} placeholder="Números separados por espacios o comas" /></label>}
        {kind === "xy" && <label>{test === "regression" ? "Y (respuesta)" : "Y / después"}<textarea rows={3} value={y} onChange={(e) => setY(e.target.value)} /></label>}
        {kind === "gof" && <label>Esperadas (opcional; vacío = uniforme)<textarea rows={2} value={expected} onChange={(e) => setExpected(e.target.value)} /></label>}
        {kind === "groups" && <label>Grupos (uno por línea: «Nombre: valores»)<textarea rows={5} value={groups} onChange={(e) => setGroups(e.target.value)} /></label>}
        {kind === "table" && <label>Tabla de contingencia (filas en líneas)<textarea rows={4} value={table} onChange={(e) => setTable(e.target.value)} /></label>}
        <button disabled={busy}>{busy ? "Calculando…" : "Calcular"}</button>
        {err && <p className="error" role="alert">{err}</p>}
      </form>
      {result && (
        <div className="inv-card inv-result" aria-live="polite">
          <h2>{result.label}</h2>
          {result.status !== "calculated" ? <p className="error">{result.reason}</p> : (
            <>
              <div className={"inv-decision " + (result.p < result.alpha ? "sig" : "")}>{result.decision}</div>
              <dl className="inv-stats">
                <div><dt>Estadístico</dt><dd>{fmt(result.statistic)}</dd></div>
                <div><dt>p</dt><dd>{fmt(result.p)}</dd></div>
                {result.df !== undefined && <div><dt>gl</dt><dd>{fmt(result.df, 2)}</dd></div>}
                <div><dt>n</dt><dd>{result.n}</dd></div>
                <div><dt>{result.effect.name}</dt><dd>{fmt(result.effect.value, 3)} <small>{result.effect.magnitude}</small></dd></div>
              </dl>
              {result.descriptives && <pre className="inv-desc">{JSON.stringify(result.descriptives, (_, v) => (typeof v === "number" ? Number(v.toFixed(4)) : v), 1)}</pre>}
              {result.normality && <p className="muted">{result.normality.test}: W={result.normality.W.toFixed(3)}, p={result.normality.p.toFixed(4)} → {result.normality.normal ? "normal (t pareada válida)" : "no normal (usa Wilcoxon)"}</p>}
              {result.warnings?.map((w: string) => <p key={w} className="inv-warn">⚠ {w}</p>)}
              <p className="muted">Supuestos: {result.assumptions.join(" · ")}</p>
              <p>{result.interpretation}</p>
              <button disabled={busy} onClick={() => void run("interpret")}>Redactar interpretación con el LLM local</button>
              {prose && <blockquote className="inv-prose">{prose.text}<small>{prose.engine} · {prose.note}</small></blockquote>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Code = { id: string; label: string; level: "abierto" | "axial" | "emergente"; parent: string | null; memo: string };
type Segment = { id?: string; text: string; codes: string[] };
type Informant = { id?: string; alias: string; profile: string; criteria_met: string[]; segments: Segment[] };
const emptyDoc = { title: "", design: { instrument: "entrevista", objective: "", guide: [] as string[], criteria: [] as string[], saturation_window: 2 }, codes: [] as Code[], informants: [] as Informant[] };

function Qualitative({ post, onBusy, last }: { post: Post; onBusy: (b: boolean) => void; last: any }) {
  const [list, setList] = useState<any[]>([]), [doc, setDoc] = useState<any>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [tri, setTri] = useState<any>(null);
  const [codeLabel, setCodeLabel] = useState(""), [codeLevel, setCodeLevel] = useState<Code["level"]>("abierto"), [codeParent, setCodeParent] = useState(""), [transcript, setTranscript] = useState(""), [alias, setAlias] = useState("");
  async function call(action: string, extra: any = {}) {
    setBusy(true); onBusy(true); setErr("");
    try { return await post("research", { action, ...extra }); } catch (e) { setErr((e as Error).message); return null; } finally { setBusy(false); onBusy(false); }
  }
  useEffect(() => { void call("qual_list").then((r) => r && setList(r)); }, []);
  async function save(next = doc) { const r = await call("qual_save", { doc: next }); if (r) { setDoc(r); setList((await call("qual_list")) || list); } }
  const edit = (patch: any) => setDoc((d: any) => ({ ...d, ...patch }));
  const design = (patch: any) => setDoc((d: any) => ({ ...d, design: { ...d.design, ...patch } }));
  const categories = (doc?.codes || []).filter((c: Code) => c.level !== "abierto");
  if (!doc) return (
    <div className="inv-card">
      <h2>Investigaciones cualitativas</h2>
      <p className="muted">Flujo inspirado en el <i>Manual de Investigación Cualitativa</i> de Simón Pedro Izcara Palacios: diseño del instrumento y muestreo intencional hasta la saturación teórica, codificación abierta → axial → categorías emergentes, y triangulación con los hallazgos cuantitativos.</p>
      <ul className="inv-list">{list.map((q) => <li key={q.id}><button onClick={() => void call("qual_get", { id: q.id }).then((r) => r && setDoc(r))}>{q.title}</button></li>)}</ul>
      <button onClick={() => setDoc({ ...emptyDoc, title: "Nueva investigación cualitativa" })}>＋ Nueva investigación</button>
      {err && <p className="error">{err}</p>}
    </div>
  );
  return (
    <div className="inv-qual">
      <div className="inv-toolbar">
        <button className="secondary" onClick={() => { setDoc(null); setTri(null); }}>← Lista</button>
        <input aria-label="Título" value={doc.title} onChange={(e) => edit({ title: e.target.value })} />
        <button disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar"}</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="inv-grid">
        <div className="inv-card">
          <h2>1 · Diseño e informantes clave</h2>
          <label>Instrumento
            <select value={doc.design.instrument} onChange={(e) => design({ instrument: e.target.value })}>
              <option value="entrevista">Entrevista en profundidad</option><option value="grupo_focal">Grupo focal</option><option value="observacion">Observación participante</option>
            </select>
          </label>
          <label>Objetivo<textarea rows={2} value={doc.design.objective} onChange={(e) => design({ objective: e.target.value })} /></label>
          <label>Guion (un tema o pregunta por línea)<textarea rows={4} value={doc.design.guide.join("\n")} onChange={(e) => design({ guide: e.target.value.split("\n") })} /></label>
          <label>Criterios de selección de informantes (muestreo intencional)<textarea rows={3} value={doc.design.criteria.join("\n")} onChange={(e) => design({ criteria: e.target.value.split("\n") })} /></label>
          <label>Saturación: entrevistas seguidas sin códigos nuevos <input type="number" min={1} max={10} value={doc.design.saturation_window} onChange={(e) => design({ saturation_window: Number(e.target.value) })} /></label>
          {doc.saturation && (
            <div className="inv-saturation">
              <p className={doc.saturation.reached ? "ok" : "muted"}>{doc.saturation.note}</p>
              <div className="inv-bars">{doc.saturation.curve.map((c: any) => <span key={c.informant} title={`${c.informant}: ${c.new_codes} nuevos`} style={{ height: 6 + c.new_codes * 10 }}><small>{c.informant}</small></span>)}</div>
            </div>
          )}
        </div>
        <div className="inv-card">
          <h2>2 · Códigos y categorías</h2>
          <div className="inv-row">
            <input placeholder="Etiqueta del código" value={codeLabel} onChange={(e) => setCodeLabel(e.target.value)} />
            <select value={codeLevel} onChange={(e) => setCodeLevel(e.target.value as Code["level"])}><option value="abierto">Abierto</option><option value="axial">Axial (categoría)</option><option value="emergente">Emergente</option></select>
            {codeLevel === "abierto" && <select value={codeParent} onChange={(e) => setCodeParent(e.target.value)}><option value="">Sin categoría</option>{categories.map((c: Code) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}
            <button type="button" disabled={!codeLabel.trim()} onClick={() => { const id = codeLabel.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").slice(0, 28) + "-" + Math.random().toString(36).slice(2, 6); edit({ codes: [...doc.codes, { id, label: codeLabel.trim(), level: codeLevel, parent: codeLevel === "abierto" ? codeParent || null : null, memo: "" }] }); setCodeLabel(""); }}>Añadir</button>
          </div>
          <ul className="inv-codes">{doc.codes.map((c: Code) => (
            <li key={c.id} className={c.level}>
              <b>{c.label}</b> <small>{c.level}{c.parent ? " → " + (doc.codes.find((p: Code) => p.id === c.parent)?.label || "") : ""}</small>
              {c.level === "abierto" && <select aria-label={"Categoría de " + c.label} value={c.parent || ""} onChange={(e) => edit({ codes: doc.codes.map((x: Code) => x.id === c.id ? { ...x, parent: e.target.value || null } : x) })}><option value="">Sin categoría</option>{categories.map((p: Code) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>}
            </li>
          ))}</ul>
        </div>
      </div>
      <div className="inv-card">
        <h2>3 · Transcripciones y codificación</h2>
        <div className="inv-row">
          <input placeholder="Alias del informante (sin nombre real)" value={alias} onChange={(e) => setAlias(e.target.value)} />
        </div>
        <textarea rows={4} placeholder="Pega la transcripción: cada párrafo se convierte en un segmento" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        <button type="button" disabled={!transcript.trim()} onClick={() => { edit({ informants: [...doc.informants, { alias: alias.trim() || `Informante ${doc.informants.length + 1}`, profile: "", criteria_met: [], segments: transcript.split(/\n\s*\n|\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text, codes: [] })) }] }); setTranscript(""); setAlias(""); }}>Añadir transcripción</button>
        {doc.informants.map((inf: Informant, i: number) => (
          <details key={i} className="inv-informant" open={i === doc.informants.length - 1}>
            <summary>{inf.id || "Nuevo"} · {inf.alias} <small>{inf.segments.length} segmentos</small></summary>
            {doc.design.criteria.filter(Boolean).length > 0 && <div className="inv-criteria">{doc.design.criteria.filter(Boolean).map((c: string) => (
              <label key={c}><input type="checkbox" checked={inf.criteria_met.includes(c)} onChange={(e) => edit({ informants: doc.informants.map((x: Informant, j: number) => j === i ? { ...x, criteria_met: e.target.checked ? [...x.criteria_met, c] : x.criteria_met.filter((k) => k !== c) } : x) })} /> {c}</label>
            ))}</div>}
            {inf.segments.map((s, k) => (
              <div key={k} className="inv-segment">
                <p><small>{s.id}</small> {s.text}</p>
                <div className="inv-chips">
                  {s.codes.map((cid) => <button key={cid} className="chip" title="Quitar código" onClick={() => edit({ informants: doc.informants.map((x: Informant, j: number) => j !== i ? x : { ...x, segments: x.segments.map((y, m) => m !== k ? y : { ...y, codes: y.codes.filter((z) => z !== cid) }) }) })}>{doc.codes.find((c: Code) => c.id === cid)?.label || cid} ✕</button>)}
                  <select aria-label="Asignar código" value="" onChange={(e) => e.target.value && edit({ informants: doc.informants.map((x: Informant, j: number) => j !== i ? x : { ...x, segments: x.segments.map((y, m) => m !== k || y.codes.includes(e.target.value) ? y : { ...y, codes: [...y.codes, e.target.value] }) }) })}>
                    <option value="">＋ código</option>{doc.codes.map((c: Code) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </details>
        ))}
      </div>
      {doc.matrix?.length > 0 && (
        <div className="inv-card">
          <h2>Matriz de análisis cualitativo</h2>
          <div className="inv-table-wrap"><table className="inv-table">
            <thead><tr><th>Categoría</th><th>Códigos</th>{doc.informants.map((i: Informant) => <th key={i.id}>{i.id}</th>)}<th>Total</th></tr></thead>
            <tbody>{doc.matrix.map((r: any) => <tr key={r.category}><td><b>{r.label}</b> <small>{r.level}</small></td><td>{r.codes.join(", ") || "—"}</td>{doc.informants.map((i: Informant) => <td key={i.id}>{r.cells[i.id!] || ""}</td>)}<td>{r.total}</td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      <div className="inv-card">
        <h2>4 · Triangulación metodológica</h2>
        <p className="muted">Cruza el último resultado de «Pruebas de hipótesis» ({last?.status === "calculated" ? `${last.label}, p = ${fmt(last.p)}` : "ninguno todavía"}) con los segmentos codificados guardados. Solo se conservan afirmaciones con citas literales de las transcripciones.</p>
        <button disabled={busy || !doc.id || last?.status !== "calculated"} onClick={() => void call("triangulate", { id: doc.id, result: last }).then((r) => r && setTri(r))}>Triangular con el LLM local</button>
        {tri && (
          <div className="inv-tri">
            <div className={"inv-decision " + (tri.verdict === "convergente" ? "sig" : "")}>{tri.verdict}</div>
            <p>{tri.summary}</p>
            <ul>{tri.claims.map((c: any, i: number) => <li key={i}>{c.claim}<blockquote>«{c.quote}» <small>{c.segments.join(", ")}</small></blockquote></li>)}</ul>
            {tri.rejected_claims > 0 && <p className="inv-warn">{tri.rejected_claims} afirmación(es) descartadas por no citar literalmente un segmento.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
