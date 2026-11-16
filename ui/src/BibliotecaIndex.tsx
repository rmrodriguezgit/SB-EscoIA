import { useEffect, useState } from "react";

type Post = (path: string, v: any) => Promise<any>;
type Doc = { id: string; name: string; career: string; career_name: string; pages: number; chunks: number; vectors: number; bytes: number | null; state: string; level: string; subject: string; doc_type: string; categorized: boolean };
const size = (b: number | null) => (b == null ? "—" : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Estado del índice RAG, categorías, vista previa y búsqueda híbrida con citas exactas. */
export function BibliotecaIndex({ post, admin }: { post: Post; admin: boolean }) {
  const [data, setData] = useState<any>(null), [err, setErr] = useState(""), [group, setGroup] = useState("doc_type");
  const [query, setQuery] = useState(""), [filters, setFilters] = useState({ career: "", doc_type: "", level: "" }), [hits, setHits] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null), [editing, setEditing] = useState<Doc | null>(null), [busy, setBusy] = useState(false);
  const load = () => fetch("/api/library/status").then((r) => r.json()).then((d) => { if (d.error) throw Error(d.error); setData(d); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, []);
  if (!data) return <div className="inv-card">{err ? <p className="error">{err}</p> : <p className="muted">Leyendo el índice…</p>}</div>;
  const docs: Doc[] = data.documents;
  const groups = docs.reduce((acc: Record<string, Doc[]>, d) => { const k = group === "career" ? d.career_name : (d as any)[group] || "—"; (acc[k] ||= []).push(d); return acc; }, {});
  return (
    <section className="lib-index">
      <div className="lib-totals">
        <div><b>{data.total.documents}</b><small>documentos</small></div>
        <div><b>{data.total.chunks.toLocaleString("es-MX")}</b><small>fragmentos (chunks)</small></div>
        <div><b>{data.total.vectors.toLocaleString("es-MX")}</b><small>embeddings · {data.total.model}</small></div>
        <div><b>{size(data.total.bytes)}</b><small>en disco</small></div>
        <p className={data.total.vectors ? "ok" : "warn"}>Búsqueda semántica: {data.semantic}</p>
        {admin && !data.total.vectors && <button className="secondary" disabled={busy} onClick={async () => { setBusy(true); setErr(""); try { const r = await post("library", { action: "embed" }); setErr(`Indexados ${r.indexed} fragmentos con ${r.model}.`); await load(); } catch (e) { setErr("No se pudieron generar embeddings: " + (e as Error).message); } finally { setBusy(false); } }}>{busy ? "Generando embeddings…" : "Generar embeddings (puede tardar)"}</button>}
      </div>
      <form className="inv-card lib-search" onSubmit={async (e) => { e.preventDefault(); setErr(""); try { setHits(await post("library", { action: "search", query, ...filters })); } catch (e2) { setErr((e2 as Error).message); } }}>
        <h2>Búsqueda en la biblioteca</h2>
        <div className="inv-row">
          <input aria-label="Buscar en documentos" placeholder="Concepto, materia o clave…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Carrera" value={filters.career} onChange={(e) => setFilters({ ...filters, career: e.target.value })}><option value="">Todas las carreras</option>{[...new Set(docs.map((d) => d.career))].map((c) => <option key={c} value={c}>{docs.find((d) => d.career === c)?.career_name}</option>)}</select>
          <select aria-label="Tipo" value={filters.doc_type} onChange={(e) => setFilters({ ...filters, doc_type: e.target.value })}><option value="">Todos los tipos</option>{data.doc_types.map((t: string) => <option key={t}>{t}</option>)}</select>
          <select aria-label="Nivel" value={filters.level} onChange={(e) => setFilters({ ...filters, level: e.target.value })}><option value="">Todos los niveles</option>{data.levels.map((t: string) => <option key={t}>{t}</option>)}</select>
          <button disabled={!query.trim()}>Buscar</button>
        </div>
        {hits && <div className="lib-hits"><p className="muted">Modo: {hits.mode} · {hits.results.length} resultado(s)</p>
          {hits.results.map((h: any, i: number) => <blockquote key={i}><p>{h.text}</p><cite>[{i + 1}] {h.citation}{h.document_id && <> · <a href={`/api/source?id=${h.document_id}`} target="_blank" rel="noreferrer">abrir fuente ↗</a></>}</cite></blockquote>)}
        </div>}
      </form>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="inv-card">
        <div className="lib-head"><h2>Documentos indexados</h2>
          <label>Agrupar por <select value={group} onChange={(e) => setGroup(e.target.value)}><option value="doc_type">Tipo de documento</option><option value="career">Carrera</option><option value="level">Nivel</option><option value="subject">Materia</option></select></label>
        </div>
        {Object.entries(groups).sort().map(([k, list]) => (
          <details key={k} open>
            <summary>{k} <small>{list.length}</small></summary>
            <table className="inv-table lib-table"><tbody>{list.map((d) => (
              <tr key={d.id}>
                <td><b>{d.name}</b><small>{d.career_name} · {d.level}{d.subject ? " · " + d.subject : ""}{!d.categorized ? " · tipo sugerido" : ""}</small></td>
                <td>{d.pages} p.</td><td>{d.chunks} frag.</td><td>{d.vectors} emb.</td><td>{size(d.bytes)}</td>
                <td><span className={"lib-state " + (d.vectors ? "ok" : "lex")}>{d.state}</span></td>
                <td className="lib-actions"><button className="text-button" onClick={async () => setPreview(await post("library", { action: "preview", id: d.id }))}>Vista previa</button>{admin && <button className="text-button" onClick={() => setEditing({ ...d })}>Categorizar</button>}</td>
              </tr>))}</tbody></table>
          </details>
        ))}
      </div>
      {editing && (
        <div className="edit-dialog" role="dialog" aria-label="Categorizar documento">
          <b>{editing.name}</b>
          <label>Nivel <select value={editing.level} onChange={(e) => setEditing({ ...editing, level: e.target.value })}>{data.levels.map((t: string) => <option key={t}>{t}</option>)}</select></label>
          <label>Materia <input value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Clave o nombre (opcional)" /></label>
          <label>Tipo <select value={editing.doc_type} onChange={(e) => setEditing({ ...editing, doc_type: e.target.value })}>{data.doc_types.map((t: string) => <option key={t}>{t}</option>)}</select></label>
          <div className="actions"><button onClick={async () => { try { await post("library", { action: "meta", id: editing.id, level: editing.level, subject: editing.subject, doc_type: editing.doc_type }); setEditing(null); await load(); } catch (e) { setErr((e as Error).message); } }}>Guardar</button><button className="secondary" onClick={() => setEditing(null)}>Cancelar</button></div>
        </div>
      )}
      {preview && (
        <div className="lib-preview" role="dialog" aria-label={"Vista previa de " + preview.name}>
          <header><b>{preview.name}</b><span>{preview.pages} páginas</span><a href={`/api/source?id=${preview.id}`} target="_blank" rel="noreferrer">Abrir original ↗</a><button className="text-button" onClick={() => setPreview(null)}>Cerrar ✕</button></header>
          {preview.chunks.map((c: any, i: number) => <article key={i}><small>p. {c.page}</small><p>{c.text}</p></article>)}
        </div>
      )}
    </section>
  );
}
