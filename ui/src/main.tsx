import { RELEASE } from "./release";
import {PendingOperation} from './PendingOperation';
import {AcademicConnection} from "./AcademicConnection";
import {AcademicAnswer} from './AcademicAnswer';
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { RequestGit } from "./RequestGit";
import { RequestRecord } from "./RequestRecord";
import { ResearchDashboard } from "./ResearchDashboard";
import { VoiceInput } from "./VoiceInput";
import { Cuerdas, type RequestEvent } from "./Cuerdas";
import { ResponseActions, type Artifact } from "./ResponseActions";
type Document = { id: string; name: string; pages: number };
type Career = { code: string; name: string; documents: Document[] };
type Memory = {
  id: string;
  text: string;
  type: string;
  date: string;
  status: string;
};
type Task = {
  id: string;
  objective: string;
  status: string;
  agent: string;
  result: string | null;
  error: string | null;
};
type Source = {
  url?: string;
  id: string;
  document_id?: string;
  citation: string;
  text: string;
  page: number;
};
type Message = {
  request_record?: { id: string; verification?: { passed: boolean } };
  validation?: { status: string; passed?: boolean };
  role: "user" | "assistant";
  text: string;
  sources?: Source[];
  mode?: string;
  artifacts?: Artifact[];
  pending_operation?: { id: string; summary: string };
};
type Resources={provider?:string;model?:string;llmlx?:{connected:boolean;reason?:string;engine?:string;default_model?:string;breaker_open?:boolean;available_gib?:number;threshold_gib?:number;total_gib?:number;pressure?:string};memory:{used_gib?:number;limit_gib:number;pressure?:string;error?:string;headroom_gib?:number;reserve_gib?:number;shortfall_gib?:number;can_load?:boolean};qwen:{status:string;resident:{name:string;size_gib:number}[]};laya:{status:string};pipeline_busy:boolean;cpu_threads:number;pdf_workers:number};
type State = {
  resources?: Resources;
  csrf: string;
  library: Career[];
  memories: Memory[];
  tasks: Task[];
  events: RequestEvent[];
  inference?:{preferred:string;active:string;reason:string;local_model:string;local_models:string[];local_models_info?:{name:string;size_gib:number|null}[]};
  model: { available: boolean; ready: boolean; model: string };
};
const icons: Record<string, string> = {
  Conversación: "✧",
  Biblioteca: "▤",
  Memoria: "◇",
  Actividad: "◷",
  Asistencia: "◎",
  Encuestas: "▧",
  Horarios: "▦",
  Calificaciones: "✓",
  Administración: "⚙",
};
function App() {
  const [academicRevision,setAcademicRevision] = useState(0);
  const [section, setSection] = useState("Conversación"),
    [state, setState] = useState<State | null>(null),
    [career, setCareer] = useState(""),
    [input, setInput] = useState(""),
    [messages, setMessages] = useState<Message[]>([]),
    [busy, setBusy] = useState(false),
    [releasing,setReleasing]=useState(false),[resourceNote,setResourceNote]=useState(""),
    [error, setError] = useState(""),
    [memory, setMemory] = useState(""),
    [edit, setEdit] = useState<string | undefined>(),
    [resultTask, setResultTask] = useState<Task | null>(null),
    [academicEvent, setAcademicEvent] = useState<{
      agent: string;
      state: string;
      message: string;
    } | null>(null),
    [command, setCommand] = useState("");
  const academicModules: Record<string, string> = {
    Asistencia: "Asistencia",
    Horarios: "Horarios",
    Calificaciones: "Calificaciones",
    Administración: "Administración",
  };
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (
        e.origin !== "http://127.0.0.1:8787" ||
        e.data?.type !== "escoia:event" ||
        e.source !== (document.querySelector(".academic-frame") as HTMLIFrameElement|null)?.contentWindow
      )
        return;
      if (typeof e.data.agent === "string" && typeof e.data.state === "string")
        setAcademicEvent(e.data);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  async function refresh() {
    const r = await fetch("/api/state");
    if (!r.ok) throw Error("No se pudo conectar con el servicio");
    setState(await r.json());
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 700);
    return () => clearInterval(timer);
  }, []);
  async function post(path: string, value: unknown) {
    const r = await fetch("/api/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": state?.csrf || "",
      },
      body: JSON.stringify(value),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    return data;
  }
  async function send(text = input) {
    if (!text.trim() || busy) return;
    const programIntent = /(?:crea|genera|elabora|prepara|haz).*?(?:programa|planeaci[oó]n)/i.test(text);
    const lessonIntent = /\b(?:tema|subtema|ipynb|explica|desarrolla)\b|marco te[oó]rico|caso pr[aá]ctico/i.test(text);
    const intent = programIntent || lessonIntent ? "" : /asistencia/i.test(text)
      ? "Asistencia"
      : /encuesta|grupo focal|focus group/i.test(text)
        ? "Encuestas"
        : /horario/i.test(text)
          ? "Horarios"
          : /calificaci[oó]n|calificaciones/i.test(text)
            ? "Calificaciones"
            : "";
    if (intent) {
      setCommand(text);
      setSection(intent);
      setInput("");
      return;
    }
    setError("");
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const data = await post("chat", { question: text, career });
      setMessages((m) => [...m, { role: "assistant", ...data }]);
      await refresh();
    } catch (e) {
      setError("Se perdió la conexión con el servicio. Revisa Actividad para ver el expediente y su resultado; si figura interrumpido, vuelve a enviar la petición.");
    } finally {
      setBusy(false);
    }
  }
  async function saveMemory() {
    try {
      await post("remember", { text: memory, id: edit });
      setMemory("");
      setEdit(undefined);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          <span className="mark">e</span>
          <div>
            Esco<span>IA</span>
            <small className="release-label">v{RELEASE.version} · Liberación <time dateTime={RELEASE.date}>{RELEASE.label}</time></small>
            <small>CONOCIMIENTO QUE CONECTA</small>
          </div>
        </a>
        <div className="workspace">
          <span className="avatar">R</span>
          <div>
            Mi espacio personal<small>Privado · En este Mac</small>
          </div>
          <span>⌄</span>
        </div>
        <p className="nav-label">TU ESPACIO</p>
        <nav>
          {Object.keys(icons).map((x) => (
            <button
              className={section === x ? "active" : ""}
              key={x}
              onClick={() => {
                setSection(x);
                setError("");
              }}
            >
              <span>{icons[x]}</span>
              {x === "Actividad" ? "Actividad · Git" : x}
              {x === "Biblioteca" && <b>{state?.library.length || 0}</b>}
            </button>
          ))}
        </nav>
        <section className="resource-panel" aria-label="Recursos del sistema">
          <h4>Estado del sistema</h4>
          <AcademicConnection csrf={state?.csrf || ""} onConnected={() => setAcademicRevision(v => v+1)} />
          <label>Modelo LLMLX <select aria-label="Modelo LLMLX" value={state?.inference?.local_model||'llmlx:qwen3.5:4b'} disabled={busy||state?.resources?.pipeline_busy} onChange={async e=>{try{await post('inference',{model:e.target.value});await refresh()}catch(e){setError((e as Error).message)}}}>{(state?.inference?.local_models_info||[]).map(m=>{const free=state?.resources?.llmlx?.available_gib,need=m.size_gib===null?undefined:m.size_gib+(state?.resources?.llmlx?.threshold_gib??1.8),tight=free!==undefined&&need!==undefined&&free<need;return <option key={m.name} value={m.name}>{m.name.replace(/^llmlx:/,'')}{m.size_gib!==null?` · ${m.size_gib.toFixed(1)} GiB`:''}{tight?' · RAM justa':''}</option>})}</select></label>
          <p role="status">{state?.resources?.pipeline_busy?'● Procesando':!state?.resources?.llmlx?'● Comprobando':!state.resources.llmlx.connected?'● LLMLX sin conexión':state.resources.llmlx.breaker_open?'● LLMLX en pausa por poca RAM':'● LLMLX listo'}</p>
          <dl><dt>Motor</dt><dd>{state?.resources?.llmlx?.connected?(state.resources.llmlx.engine||'Conectado'):(state?.resources?.llmlx?.reason||'LocalLLM.app · 127.0.0.1:11500')}</dd><dt>Modelo</dt><dd>{state?.resources?.qwen.resident.length?'Cargado':'Sin cargar'}</dd><dt>RAM libre</dt><dd>{state?.resources?.llmlx?.available_gib!==undefined?`${state.resources.llmlx.available_gib.toFixed(2)} GiB · pausa < ${state.resources.llmlx.threshold_gib?.toFixed(1)} GiB`:'—'}</dd><dt>Presión</dt><dd>{state?.resources?.memory.pressure||'Sin medición'}</dd><dt>Laya</dt><dd>{state?.resources?.laya.status||'Comprobando'}</dd></dl>
          <button disabled={releasing||busy||state?.resources?.pipeline_busy} onClick={async()=>{setReleasing(true);setResourceNote('');try{const r=await post('resources/release',{});setResourceNote(r.message);setState(current=>current?{...current,resources:r.resources}:current);await refresh()}catch(e){setResourceNote((e as Error).message)}finally{setReleasing(false)}}}>{releasing?'Liberando y comprobando…':'Liberar memoria'}</button>
          <small role="status">{resourceNote||(busy||state?.resources?.pipeline_busy?'Espera a que termine la petición activa.':'Descarga el modelo de EscoIA en LLMLX. No cierra aplicaciones ni elimina datos.')}</small>
        </section>
        <div className="side-note">
          <span>◈</span>
          <h4>Tu conocimiento, contigo.</h4>
          <p>
            Memoria y documentos guardados localmente, con fuentes que puedes
            consultar.
          </p>
        </div>
        <div className="local-status">
          <i /> Núcleo local activo
          <small>
            {state?.model.ready
              ? "Qwen listo para conversar"
              : "Consulta documental disponible"}
          </small>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <span className="breadcrumb">Mi espacio</span>
            <span className="slash">/</span>
            {section}
          </div>
          <div className="top-status">
            <span className="pill">◉ Local</span>
            <span className="user">R</span>
          </div>
        </header>
        <div className="content">
          <Cuerdas events={state?.events||[]} busy={busy} module={academicModules[section]?section:undefined} academic={academicEvent}/>
          {section==="Encuestas" && <ResearchDashboard post={post} onBusy={setBusy}/>}
          {academicModules[section] && (
            <>
              <div className="module-heading">
                <h1>
                  {section === "Encuestas"
                    ? "Encuestas e investigación mixta"
                    : section}
                </h1>
                <p>
                  Operaciones académicas con permisos, datos y registros
                  auditables.
                </p>
                {command && (
                  <div className="command-draft">
                    Orden recibida: {command}. Revisa los datos y confirma la
                    operación en el módulo.
                  </div>
                )}
              </div>
              <iframe
                key={section + academicRevision}
                className="academic-frame"
                title={section}
                src={`http://127.0.0.1:8787/?embed=1&modulo=${encodeURIComponent(academicModules[section])}`}
                allow="camera; microphone"
              />
              <p className="privacy-note">
                Acceso directo en este Mac.{" "}
                <a
                  href="http://127.0.0.1:8787/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir servicio académico ↗
                </a>
              </p>
            </>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {section === "Conversación" && (
            <>
              <div className="greeting">
                <span className="eyebrow">TU SEGUNDO CEREBRO ACADÉMICO</span>
                <h1>Una idea. Muchas posibilidades.</h1>
                <p>
                  Conversa con tus planes de estudio, recupera lo importante y
                  da el siguiente paso.
                </p>
              </div>
              <div className="scope">
                <span>Buscar en</span>
                <select
                  aria-label="Carrera para la consulta"
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                >
                  <option value="">Toda mi biblioteca</option>
                  {state?.library.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="scope-right">
                  {state?.library.reduce((n, c) => n + c.documents.length, 0) ||
                    0}{" "}
                  documentos con fuentes
                </span>
              </div>
              {messages.length === 0 ? (
                <>
                  <div className="prompt-grid">
                    <button
                      onClick={() =>
                        send("Dame las materias de primer semestre de Actuaría")
                      }
                    >
                      <span className="tile-icon lavender">▤</span>
                      <h3>Explora un plan de estudios</h3>
                      <p>
                        ¿Qué materias hay en el primer semestre de Actuaría?
                      </p>
                      <span className="arrow">↗</span>
                    </button>
                    <button
                      onClick={() =>
                        send("LAR105 Prácticas Preliminares de la Profesión")
                      }
                    >
                      <span className="tile-icon apricot">✧</span>
                      <h3>Profundiza en una materia</h3>
                      <p>
                        Consulta contenidos, objetivos y actividades de LAR105.
                      </p>
                      <span className="arrow">↗</span>
                    </button>
                    <button onClick={() => setSection("Memoria")}>
                      <span className="tile-icon mint">◇</span>
                      <h3>Recuerda lo importante</h3>
                      <p>Guarda una decisión o una preferencia para después.</p>
                      <span className="arrow">↗</span>
                    </button>
                  </div>
                  <div className="library-preview">
                    <div className="section-row">
                      <h2>Tu biblioteca académica</h2>
                      <button
                        className="text-button"
                        onClick={() => setSection("Biblioteca")}
                      >
                        Ver biblioteca →
                      </button>
                    </div>
                    <div className="mini-careers">
                      {state?.library.slice(0, 3).map((c, i) => (
                        <button
                          key={c.code}
                          onClick={() => {
                            setCareer(c.code);
                            setSection("Biblioteca");
                          }}
                        >
                          <span className={"book book" + i}>▥</span>
                          <div>
                            <h4>{c.name}</h4>
                            <small>
                              Plan 2025 · {c.documents.length} anexos
                            </small>
                          </div>
                          <span>↗</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="messages" aria-live="polite">
                  {messages.map((m, i) => (
                    <article className={"message " + m.role} key={i}>
                      <div className="message-label">
                        {m.role === "user" ? "Tú" : "✧ EscoIA"}
                        {m.mode && <small>{m.mode}</small>}
                      </div>
                      {m.role==="assistant" && <ResponseActions text={m.text} artifacts={m.artifacts}/>}
                      <AcademicAnswer text={m.text}/>
                      {m.pending_operation && state && <PendingOperation id={m.pending_operation.id} summary={m.pending_operation.summary} csrf={state.csrf}/>}
                      {m.request_record && state && <RequestRecord id={m.request_record.id} csrf={state.csrf} verification={m.request_record.verification} initialOpen/>}
                      {m.validation && (
                        <p className="validation-label">
                          Sustento y contenido:{" "}
                          {m.validation.status === "program_verified" ? "Temario y semanas comprobados; propuesta para revisión docente" : m.validation.status === "deterministic_case_verified" ? "Caso y fórmulas comprobados; revisión del modelo registrada por separado" : m.validation.passed
                            ? "Revisión automática superada"
                            : m.validation.status === "not_run"
                              ? "No ejecutado"
                              : m.mode?.startsWith("RAG estructurado")
                                ? "Revisión del modelo pendiente; datos consultados directamente con fuentes"
                                : "Respuesta pendiente o retenida"}
                        </p>
                      )}
                      {m.sources?.length ? (
                        <div className="sources">
                          <h5>FUENTES CONSULTADAS</h5>
                          {m.sources.map((s, n) => (
                            <a
                              key={s.id}
                              href={
                                s.url?.startsWith("https://doi.org/") ? s.url : s.document_id
                                  ? `/api/source?id=${s.document_id}#page=${s.page}`
                                  : undefined
                              }
                              target="_blank"
                              rel="noreferrer"
                            >
                              <b>{n + 1}</b>
                              {s.citation} ↗
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {busy && (
                    <div className="thinking">
                      ✧ Recuperando evidencia y preparando respuesta…
                    </div>
                  )}
                </div>
              )}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  aria-label="Tu pregunta"
                  placeholder="Pregunta, conecta ideas o busca algo en tus documentos…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <div className="composer-bottom">
                  <VoiceInput
                    transcribe={(pcm) => post("voice", { pcm })}
                    onText={(text) => {
                      setInput(text);
                      setError(
                        "Transcripción lista. Revísala y pulsa enviar para ejecutar la orden.",
                      );
                    }}
                    onError={setError}
                  />

                  <span>
                    ✧{" "}
                    {state?.model.ready
                      ? (state?.resources?.provider ? "Qwen · servidor T4" : "Qwen · en tu Mac")
                      : "Búsqueda local · con referencias"}
                  </span>
                  <button
                    disabled={busy || !input.trim()}
                    aria-label="Enviar pregunta"
                  >
                    ↑
                  </button>
                </div>
              </form>
              <p className="privacy-note">
                ◈ Fuentes locales y referencias públicas. Revisa siempre la evidencia antes de tomar
                decisiones.
              </p>
            </>
          )}
          {section === "Biblioteca" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">PLANES DE ESTUDIO</span>
                <h1>Conocimiento, por carrera.</h1>
                <p>
                  Los anexos de tu ZIP, organizados y listos para consultar.
                  Cada resultado conserva su documento y página.
                </p>
              </div>
              <div className="scope">
                <span>Filtrar</span>
                <select
                  value={career}
                  onChange={(e) => setCareer(e.target.value)}
                  aria-label="Filtrar biblioteca"
                >
                  <option value="">Todas las carreras</option>
                  {state?.library.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="career-grid">
                {state?.library
                  .filter((c) => !career || c.code === career)
                  .map((c, i) => (
                    <article className="career-card" key={c.code}>
                      <div className="career-top">
                        <span className={"book book" + (i % 3)}>▥</span>
                        <span className="code">{c.code} · 2025</span>
                      </div>
                      <h2>{c.name}</h2>
                      <p>
                        {c.documents.length} documentos ·{" "}
                        {c.documents.reduce((n, d) => n + d.pages, 0)} páginas
                      </p>
                      <div className="documents">
                        {c.documents.map((d) => (
                          <a
                            key={d.id}
                            href={`/api/source?id=${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span>▤</span>
                            <div>
                              {d.name.replace(/^\d+_/, "")}
                              <small>{d.pages} páginas · PDF original</small>
                            </div>
                            ↗
                          </a>
                        ))}
                      </div>
                      <button
                        className="career-action"
                        onClick={() => {
                          setCareer(c.code);
                          setSection("Conversación");
                          setInput(`Consulta el plan de ${c.name}: `);
                        }}
                      >
                        Conversar con este plan →
                      </button>
                    </article>
                  ))}
              </div>
              <div className="import-note">
                <b>Indexación incremental</b>
                <p>
                  Para incorporar otro ZIP:{" "}
                  <code>brain sync "/ruta/planes.zip"</code>. Los archivos ya
                  indexados se reconocen por su contenido.
                </p>
              </div>
            </>
          )}
          {section === "Memoria" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">CONTINUIDAD PERSONAL</span>
                <h1>Lo importante permanece.</h1>
                <p>
                  Hechos, preferencias y decisiones con fecha y procedencia.
                  Puedes corregirlos u olvidarlos.
                </p>
              </div>
              <div className="memory-form">
                <textarea
                  placeholder="¿Qué quieres recordar?"
                  aria-label="Nuevo recuerdo"
                  value={memory}
                  onChange={(e) => setMemory(e.target.value)}
                />
                <button disabled={!memory.trim()} onClick={saveMemory}>
                  {edit ? "Guardar corrección" : "Guardar recuerdo"} →
                </button>
                {edit && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setEdit(undefined);
                      setMemory("");
                    }}
                  >
                    Cancelar edición
                  </button>
                )}
              </div>
              <div className="memory-list">
                {state?.memories.map((m) => (
                  <article key={m.id}>
                    <div className="memory-meta">
                      ◇{" "}
                      {m.type === "sessions"
                        ? "Conversación"
                        : m.type === "facts"
                          ? "Hecho"
                          : (
                              {
                                preferences: "Preferencia",
                                projects: "Proyecto",
                                decisions: "Decisión",
                                daily: "Diario",
                                inbox: "Entrada",
                              } as Record<string, string>
                            )[m.type] || m.type}{" "}
                      <span>
                        {new Date(m.date).toLocaleDateString("es-MX")} ·{" "}
                        {m.status}
                      </span>
                    </div>
                    <p>{m.text}</p>
                    <div className="memory-actions">
                      <button
                        onClick={() => {
                          setEdit(m.id);
                          setMemory(m.text);
                        }}
                      >
                        Corregir
                      </button>
                      <button
                        onClick={async () => {
                          if (
                            confirm(
                              "¿Olvidar este recuerdo y retirarlo de los índices?",
                            )
                          ) {
                            await post("forget", { id: m.id });
                            refresh();
                          }
                        }}
                      >
                        Olvidar
                      </button>
                    </div>
                  </article>
                ))}
                {!state?.memories.length && (
                  <p className="empty">
                    Aún no hay recuerdos. Guarda el primero para recuperarlo en
                    otra sesión.
                  </p>
                )}
              </div>
            </>
          )}
          {section === "Actividad" && (
            <>
              {state && <RequestGit csrf={state.csrf}/>}
              <div className="page-heading">
                <span className="eyebrow">CONSTELACIONES LOCALES</span>
                <h1>Cada tarea tiene su ritmo.</h1>
                <p>
                  Una cola persistente, agentes como roles y una sola inferencia
                  activa.
                </p>
              </div>
              <form
                className="task-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await post("task", { objective: input });
                    setInput("");
                    refresh();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <input
                  placeholder="Objetivo de investigación local…"
                  aria-label="Objetivo de tarea"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button disabled={!input.trim()}>Crear tarea →</button>
              </form>
              <div className="task-list">
                {state?.tasks.map((t) => (
                  <article key={t.id}>
                    <span className={"task-dot " + t.status} />
                    <div>
                      <h3>{t.objective}</h3>
                      <small>
                        {t.agent} · {t.status}
                      </small>
                      {t.error && <p className="error">{t.error}</p>}
                    </div>
                    {t.result ? (
                      <button onClick={() => setResultTask(t)}>
                        Ver resultado ↗
                      </button>
                    ) : t.status === "pendiente" ||
                      t.status === "ejecutándose" ? (
                      <button
                        onClick={async () => {
                          await post("cancel", { id: t.id });
                          refresh();
                        }}
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
              {resultTask && (
                <article className="message assistant">
                  <div className="message-label">
                    Resultado{" "}
                    <button onClick={() => setResultTask(null)}>Cerrar</button>
                  </div>
                  <div className="message-text">
                    {JSON.parse(resultTask.result || "{}").text}
                  </div>
                </article>
              )}
              <div className="event-list">
                <h2>Registro de ejecución</h2>
                {state?.events.map((e) => (
                  <div key={e.id}>
                    <time>{new Date(e.at).toLocaleTimeString("es-MX")}</time>
                    <span>{e.state}</span>
                    <p>{e.message}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <footer>
          <div className="footer-brand">EscoIA<small>v{RELEASE.version} · Liberación <time dateTime={RELEASE.date}>{RELEASE.label}</time></small></div> <span>Un espacio para pensar, investigar y recordar.</span>
          <b>Privado por diseño</b>
        </footer>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
