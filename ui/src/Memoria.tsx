import { useEffect, useState } from "react";

type Post = (path: string, v: any) => Promise<any>;
type Msg = { role: "user" | "assistant"; text: string };
type Fact = { id: string; text: string; type: string; status: string; date: string; source: string; pinned: boolean };
const TYPES: Record<string, string> = { facts: "Hecho", preferences: "Preferencia", projects: "Proyecto", decisions: "Decisión", daily: "Diario", sessions: "Sesión", inbox: "Entrada" };
const STATUS = ["confirmado", "inferido", "pendiente", "obsoleto"];
const tokens = (msgs: Msg[]) => Math.round(msgs.map((m) => m.text || "").join("\n").length / 3.6);

export function Memoria({ post, messages, setMessages, context }: { post: Post; messages: Msg[]; setMessages: (m: Msg[]) => void; context: number }) {
  const [tab, setTab] = useState("session");
  return (
    <section className="memoria">
      <div className="page-heading">
        <span className="eyebrow">MEMORIA EN TRES CAPAS</span>
        <h1>Lo importante permanece.</h1>
        <p>Sesión activa, memoria pedagógica de tu perfil y hechos guardados. Tú decides qué se fija, se corrige o se olvida.</p>
      </div>
      <div className="inv-tabs" role="tablist">
        {[["session", "1 · Sesión"], ["pedagogy", "2 · Pedagógica"], ["facts", "3 · Hechos"]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "session" && <SessionLayer post={post} messages={messages} setMessages={setMessages} context={context} />}
      {tab === "pedagogy" && <PedagogyLayer post={post} />}
      {tab === "facts" && <FactsLayer post={post} />}
    </section>
  );
}

function SessionLayer({ post, messages, setMessages, context }: { post: Post; messages: Msg[]; setMessages: (m: Msg[]) => void; context: number }) {
  const [busy, setBusy] = useState(false), [note, setNote] = useState(""), [err, setErr] = useState("");
  const used = tokens(messages), ratio = Math.min(1, used / context);
  return (
    <div className="inv-card">
      <h2>Memoria de sesión (corto plazo)</h2>
      <p className="muted">Conversación activa de esta ventana: {messages.length} mensajes. La estimación usa ~3,6 caracteres por token, sin tokenizador.</p>
      <div className="mem-meter" role="meter" aria-valuemin={0} aria-valuemax={context} aria-valuenow={used} aria-label="Tokens de la sesión">
        <span style={{ width: `${ratio * 100}%` }} className={ratio > 0.8 ? "hot" : ""} />
      </div>
      <p><b>{used.toLocaleString("es-MX")}</b> tokens estimados de <b>{context.toLocaleString("es-MX")}</b> de contexto del modelo local ({Math.round(ratio * 100)}%).</p>
      <div className="actions">
        <button disabled={busy || messages.length < 2} onClick={async () => {
          setBusy(true); setErr("");
          try {
            const r = await post("memory", { action: "compact", messages });
            setMessages([{ role: "assistant", text: "Resumen de la sesión anterior (guardado en Memoria · Hechos):\n" + r.summary }]);
            setNote(`Sesión compactada: ${r.before.tokens} → ${r.after_tokens} tokens. El resumen quedó como recuerdo «Sesión» (inferido).`);
          } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? "Compactando con el modelo local…" : "Compactar sesión"}</button>
        <button className="secondary" disabled={!messages.length} onClick={() => { if (confirm("¿Limpiar la conversación activa? No borra recuerdos guardados.")) { setMessages([]); setNote("Sesión limpiada."); } }}>Limpiar sesión</button>
      </div>
      {note && <p role="status">{note}</p>}
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}

function PedagogyLayer({ post }: { post: Post }) {
  const [doc, setDoc] = useState<any>(null), [langs, setLangs] = useState(""), [rules, setRules] = useState(""), [note, setNote] = useState(""), [err, setErr] = useState("");
  useEffect(() => { void post("memory", { action: "pedagogy_get" }).then((d) => { setDoc(d); setLangs((d.languages || []).join(", ")); setRules((d.rules || []).join("\n")); }).catch((e) => setErr(e.message)); }, []);
  if (!doc) return <div className="inv-card">{err ? <p className="error">{err}</p> : <p className="muted">Cargando…</p>}</div>;
  return (
    <form className="inv-card" onSubmit={async (e) => {
      e.preventDefault(); setErr("");
      try {
        const d = await post("memory", { action: "pedagogy_save", pedagogy: { ...doc, languages: langs.split(",").map((x) => x.trim()).filter(Boolean), rules: rules.split("\n").map((x) => x.trim()).filter(Boolean) } });
        setDoc(d); setNote("Guardado. El Cerebro y el copiloto usan estas preferencias como contexto.");
      } catch (e2) { setErr((e2 as Error).message); }
    }}>
      <h2>Memoria pedagógica · {doc.name}</h2>
      <p className="muted">Persistente y propia de este perfil. {doc.updated ? `Actualizada ${new Date(doc.updated).toLocaleString("es-MX")}.` : "Aún sin guardar."}</p>
      <label>Estilo de enseñanza<textarea rows={3} value={doc.style} onChange={(e) => setDoc({ ...doc, style: e.target.value })} placeholder="Ej.: aprendizaje basado en problemas, ejemplos del sector financiero…" /></label>
      <label>Nivel de rigor
        <select value={doc.rigor} onChange={(e) => setDoc({ ...doc, rigor: e.target.value })}>
          {["introductorio", "intermedio", "avanzado", "posgrado"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <label>Lenguajes y herramientas preferidos (separados por comas)<input value={langs} onChange={(e) => setLangs(e.target.value)} placeholder="Python, R, Excel" /></label>
      <label>Reglas personalizadas (una por línea)<textarea rows={4} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Siempre incluir un ejercicio guiado…" /></label>
      <button>Guardar memoria pedagógica</button>
      {note && <p role="status">{note}</p>}
      {err && <p className="error" role="alert">{err}</p>}
    </form>
  );
}

function FactsLayer({ post }: { post: Post }) {
  const [facts, setFacts] = useState<Fact[]>([]), [filter, setFilter] = useState(""), [type, setType] = useState(""), [edit, setEdit] = useState<Fact | null>(null), [text, setText] = useState(""), [err, setErr] = useState("");
  const load = () => post("memory", { action: "facts" }).then(setFacts).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, []);
  async function act(body: any) { setErr(""); try { await post("memory", body); await load(); } catch (e) { setErr((e as Error).message); } }
  const shown = facts.filter((f) => (!type || f.type === type) && (!filter || f.text.toLowerCase().includes(filter.toLowerCase())));
  return (
    <div className="inv-card">
      <h2>Gestor de hechos</h2>
      <p className="muted">Los fijados tienen prioridad en el contexto del Cerebro. Marca como «obsoleto» lo que ya no es cierto: deja de recuperarse sin perder su historia.</p>
      <div className="inv-row">
        <input placeholder="Buscar en los recuerdos" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">Todos los tipos</option>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      <div className="memory-form">
        <textarea aria-label={edit ? "Corregir recuerdo" : "Nuevo recuerdo"} placeholder="¿Qué quieres recordar?" value={text} onChange={(e) => setText(e.target.value)} />
        <button disabled={!text.trim()} onClick={async () => { setErr(""); try { await post("remember", { text, id: edit?.id }); setText(""); setEdit(null); await load(); } catch (e) { setErr((e as Error).message); } }}>{edit ? "Guardar corrección" : "Guardar recuerdo"} →</button>
        {edit && <button className="text-button" onClick={() => { setEdit(null); setText(""); }}>Cancelar edición</button>}
      </div>
      {err && <p className="error" role="alert">{err}</p>}
      <div className="memory-list">
        {shown.map((m) => (
          <article key={m.id} className={(m.pinned ? "pinned " : "") + (m.status === "obsoleto" ? "obsolete" : "")}>
            <div className="memory-meta">{m.pinned ? "📌" : "◇"} {TYPES[m.type] || m.type} <span>{new Date(m.date).toLocaleDateString("es-MX")} · {m.source}</span></div>
            <p>{m.text}</p>
            <div className="memory-actions">
              <button onClick={() => void act({ action: "pin", id: m.id, pinned: !m.pinned })}>{m.pinned ? "Desfijar" : "Fijar"}</button>
              <button onClick={() => { setEdit(m); setText(m.text); }}>Editar</button>
              <select aria-label="Estado" value={m.status} onChange={(e) => void act({ action: "status", id: m.id, status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
              <button onClick={() => { if (confirm("¿Olvidar este recuerdo y retirarlo de los índices?")) void act({ action: "forget", id: m.id }); }}>Eliminar</button>
            </div>
          </article>
        ))}
        {!shown.length && <p className="empty">Sin recuerdos para este filtro.</p>}
      </div>
    </div>
  );
}
