import {RosterAdmin} from "./RosterAdmin";
import { AttendanceContext } from "./AttendanceContext";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { request, tool, upload, setCsrf, csrf } from "./api";
type Row = Record<string, any>;
type User = { id: number; roles: string[] };
const curriculum = "mcp_curriculum_tool",
  scheduler = "mcp_scheduler_tool",
  biometrics = "mcp_biometrics_tool",
  grades = "mcp_grades_tool",
  surveys = "mcp_surveys_tool";
function useTask() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [result, setResult] = useState<any>(null);
  async function run(f: () => Promise<any>) {
    setBusy(true);
    setMessage("Procesando…");
    try {
      const r = await f();
      setResult(r);
      setMessage("Operación completada");
      return r;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "No se pudo completar");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, result, run };
}
function Status({ task }: { task: ReturnType<typeof useTask> }) {
  return (
    <p className="status" role="status">
      {task.message}
    </p>
  );
}
function Table({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="muted">Sin registros.</p>;
  const keys = Object.keys(rows[0]).filter(
    (k) =>
      ![
        "password_hash",
        "encrypted_embedding",
        "vector",
        "requirements_json",
      ].includes(k),
  );
  const labels: Record<string, string> = {
    id: "ID",
    name: "Nombre",
    code: "Código",
    weekly_hours: "Horas/semana",
    semester: "Semestre",
    program: "Carrera",
    teacher: "Docente",
    subject: "Materia",
    group_code: "Grupo",
    room: "Aula",
    starts: "Inicio",
    ends: "Fin",
    cancelled: "Cancelada",
    closed: "Cerrada",
    student_id: "Estudiante",
    p1: "Parcial 1",
    p2: "Parcial 2",
    final_exam: "Examen final",
    total: "Calificación",
    absences: "Faltas",
    status: "Estado",
    prompt: "Pregunta",
    kind: "Tipo",
    text: "Respuesta",
    rating: "Valoración",
    label: "Código",
    parent_id: "Código padre",
    description: "Descripción",
    quote: "Fragmento",
    confidence: "Confianza",
    reviewed_by: "Revisado por",
    title: "Título",
    transcript: "Transcripción",
    question_id: "Pregunta",
    respondent_id: "Participante",
    survey_id: "Encuesta",
    consented_at: "Consentimiento",
    expires_at: "Vencimiento",
    dimensions: "Dimensiones",
    model: "Modelo",
    teacher_id: "Docente",
    group_id: "Grupo",
    subject_id: "Materia",
    offering_id: "Oferta",
    user_id: "Usuario",
    session_id: "Sesión",
    room_id: "Aula",
    term: "Periodo",
    created_at: "Creación",
    submitted_at: "Envío",
    closed_at: "Cierre",
    approved_by: "Aprobado por",
    recorded_at: "Registro",
    actor_id: "Usuario responsable",
    topics_json: "Temas y subtemas",
    position: "Orden",
    filename: "Archivo",
    page: "Bloque",
    score: "Similitud",
    background: "Formación",
    industry_years: "Años de experiencia",
    number: "Matrícula",
    external_id: "Usuario",
    role: "Rol",
  };
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{labels[k] ?? k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              {keys.map((k) => (
                <td key={k}>
                  {k === "starts" || k === "ends"
                    ? new Date(r[k] * 1000).toLocaleString("es-MX", {
                        timeZone: "America/Mexico_City",
                      })
                    : r[k] === null
                      ? "—"
                      : ["role", "shift", "status", "kind"].includes(k)
                        ? ((
                            {
                              admin: "Administración",
                              teacher: "Docente",
                              student: "Estudiante",
                              researcher: "Investigador",
                              morning: "Matutina",
                              evening: "Vespertina",
                              present: "Presente",
                              absent: "Falta",
                              excused: "Justificada",
                              text: "Texto",
                              choice: "Opción única",
                              audio: "Audio",
                              rating: "Valoración",
                            } as Record<string, string>
                          )[r[k]] ?? String(r[k]))
                        : String(r[k])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Result({ value }: { value: any }) {
  if (!value) return null;
  if (value.sessions)
    return (
      <>
        <p>{value.committed ? "Horario guardado" : "Vista previa"}</p>
        <Table
          rows={value.sessions.map((s: Row) => ({
            offering_id: s.offeringId,
            room_id: s.roomId,
            starts: s.starts,
            ends: s.ends,
          }))}
        />
      </>
    );
  if (value.sesiones)
    return (
      <>
        <Table rows={value.sesiones} />
        <p>{value.siguientePaso}</p>
      </>
    );
  if (value.files)
    return (
      <div>
        <div className="actions">
          {Object.entries(value.files).map(([k, url]) => (
            <a className="button" key={k} href={url as string} download>
              Descargar{" "}
              {k === "markdown"
                ? "Markdown"
                : k === "notebook"
                  ? "Colab / Jupyter"
                  : "PDF"}
            </a>
          ))}
        </div>
        <pre>{value.markdown}</pre>
      </div>
    );
  if (Array.isArray(value)) return <Table rows={value} />;
  const labels: Record<string, string> = {
    id: "ID",
    changed: "Registros modificados",
    created: "Creado",
    updated: "Actualizado",
    reviewed: "Revisado",
    deleted: "Eliminado",
    enrolled: "Estudiante registrado",
    committed: "Filas publicadas",
    offeringId: "Oferta",
    indexed: "Bloques indexados",
    studentId: "Estudiante",
    status: "Estado",
    closed: "Sesión cerrada",
    message: "Mensaje",
    runId: "Operación",
  };
  return (
    <pre>
      {JSON.stringify(
        Object.fromEntries(
          Object.entries(value).map(([k, v]) => [labels[k] ?? k, v]),
        ),
        null,
        2,
      )}
    </pre>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
function Id({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        min="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function PartituraTracker() {
  const [events, setEvents] = useState<Row[]>([]),
    [connected, setConnected] = useState(false);
  useEffect(() => {
    let disposed = false,
      socket: WebSocket,
      timer: ReturnType<typeof setTimeout>;
    const merge = (incoming: Row[]) =>
      setEvents((old) => {
        const all = new Map(old.map((e) => [`${e.runId}:${e.revision}`, e]));
        for (const e of incoming) all.set(`${e.runId}:${e.revision}`, e);
        return [...all.values()].slice(-100);
      });
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/events`,
      );
      socket.onopen = () => {
        setConnected(true);
        void request("events/replay")
          .then((r) => {
            if (!disposed) merge(r);
          })
          .catch(() => {});
      };
      socket.onmessage = (e) => {
        try {
          const v = JSON.parse(e.data);
          if (typeof v.runId === "string" && Number.isInteger(v.revision)) {
            merge([v]);
            if (window.parent !== window)
              window.parent.postMessage(
                {
                  type: "escoia:event",
                  agent: v.agent,
                  state: v.state,
                  message: v.message,
                },
                new URL(document.referrer || "http://127.0.0.1:8790").origin,
              );
          }
        } catch {}
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) timer = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.close();
    };
  }, []);
  const agents: Record<string, string> = {
    [curriculum]: "Agente curricular",
    [scheduler]: "Agente de horarios",
    [biometrics]: "Agente de asistencia",
    [grades]: "Agente de calificaciones",
    [surveys]: "Agente de investigación",
  };
  return (
    <section>
      <div className="section-title">
        <h2>Partitura · actividad de agentes</h2>
        <span className={connected ? "badge" : "badge off"}>
          {connected ? "En vivo" : "Reconectando"}
        </span>
      </div>
      <ol className="events" aria-live="polite">
        {events
          .slice(-12)
          .reverse()
          .map((e) => (
            <li key={`${e.runId}:${e.revision}`}>
              <span className="dot" />
              <div>
                <strong>{agents[e.agent] ?? e.agent}</strong>
                <p>{e.message}</p>
              </div>
              <span>{e.state}</span>
            </li>
          ))}
      </ol>
      {!events.length && (
        <p className="muted">Las operaciones aparecerán aquí.</p>
      )}
    </section>
  );
}
export function VoiceRecorder({
  onText,
  onBlob,
}: {
  onText?: (text: string) => void;
  onBlob?: (b: Blob) => void;
}) {
  const rec = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true);
  const [active, setActive] = useState(false),
    task = useTask();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
      if (rec.current?.state === "recording") rec.current.stop();
    };
  }, []);
  async function start() {
    await task.run(async () => {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      const r = new MediaRecorder(s);
      rec.current = r;
      const chunks: Blob[] = [];
      let pending = false,
        lastPartial = Date.now(),
        sequence = 0;
      async function sendAudio(b: Blob, version: number) {
        const form = new FormData();
        form.append("audio", b, "voz.webm");
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "X-CSRF-Token": csrf },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error);
        if (mounted.current && version === sequence) onText?.(data.text);
        return { transcripcion: data.text };
      }
      r.ondataavailable = (e) => {
        chunks.push(e.data);
        if (
          onText &&
          !onBlob &&
          !pending &&
          r.state === "recording" &&
          Date.now() - lastPartial >= 5000
        ) {
          pending = true;
          lastPartial = Date.now();
          const version = ++sequence;
          void sendAudio(new Blob(chunks, { type: r.mimeType }), version)
            .catch(() => {})
            .finally(() => (pending = false));
        }
      };
      r.onstop = async () => {
        s.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!mounted.current) return;
        setActive(false);
        const b = new Blob(chunks, { type: r.mimeType });
        const version = ++sequence;
        if (onBlob) {
          onBlob(b);
          return;
        }
        await task.run(() => sendAudio(b, version));
      };
      r.start(1000);
      setActive(true);
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 30000);
    });
  }
  return (
    <div>
      <div className="actions">
        <button disabled={active || task.busy} onClick={start}>
          🎙 Grabar voz
        </button>
        <button
          className="secondary"
          disabled={!active}
          onClick={() => rec.current?.stop()}
        >
          Terminar
        </button>
        {active && <span>Grabando · máximo 30 segundos</span>}
      </div>
      <Status task={task} />
    </div>
  );
}
function Home({ health }: { health: Row }) {
  const [text, setText] = useState(""),
    task = useTask();
  return (
    <>
      <section>
        <h2>Tu solicitud</h2>
        <p className="muted">
          Consulta programas y horarios con texto o voz. Las escrituras se
          realizan desde sus formularios.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Dame las materias de Actuaría de primer semestre"
          rows={3}
        />
        <div className="actions">
          <button
            disabled={task.busy || !text.trim() || !health.ai}
            onClick={() => task.run(() => request("run", { text }))}
          >
            Consultar con LAYA
          </button>
        </div>
        <VoiceRecorder onText={setText} />
        <Status task={task} />
        <Result value={task.result?.result} />
      </section>
      <section>
        <h2>Servicios locales</h2>
        <div className="metrics">
          {[
            ["Base de datos", health.database],
            ["LAYA y Qwen habilitados", health.ai],
            ["Voz", health.whisper],
            ["Visión facial", health.face],
            ["Referencias externas", health.references],
          ].map(([label, enabled]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>
                {enabled ? "Configurado" : "Pendiente de activar"}
              </strong>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
function Curriculum({ admin }: { admin: boolean }) {
  const [query, setQuery] = useState("Finanzas"),
    [program, setProgram] = useState("1"),
    [semester, setSemester] = useState("1"),
    [subject, setSubject] = useState("2"),
    [file, setFile] = useState<File | null>(null),
    [references, setReferences] = useState(
      "net present value capital budgeting",
    ),
    [kind, setKind] = useState("finance");
  const task = useTask();
  return (
    <section>
      <h2>Plan curricular y RAG privado</h2>
      <Field label="Código, materia o consulta">
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      <div className="actions">
        <button
          disabled={task.busy}
          onClick={() =>
            task.run(() => tool(curriculum, { action: "subjects", query }))
          }
        >
          Buscar materia
        </button>
        <button
          disabled={task.busy}
          onClick={() =>
            task.run(() => tool(curriculum, { action: "search", query }))
          }
        >
          Buscar en documentos
        </button>
        <button
          disabled={task.busy}
          onClick={() =>
            task.run(() =>
              tool(curriculum, { action: "search", query, semantic: true }),
            )
          }
        >
          Búsqueda semántica
        </button>
      </div>
      <div className="grid">
        <Id label="ID de carrera" value={program} onChange={setProgram} />
        <Field label="Semestre · 0 muestra todos">
          <input
            type="number"
            min="0"
            max="12"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          />
        </Field>
      </div>
      <button
        disabled={task.busy}
        onClick={() =>
          task.run(() =>
            tool(curriculum, {
              action: "semester",
              programId: Number(program),
              semester: Number(semester),
            }),
          )
        }
      >
        Materias y horas por semana
      </button>
      <Id label="ID de materia" value={subject} onChange={setSubject} />
      <div className="actions">
        <button
          disabled={task.busy}
          onClick={() =>
            task.run(() =>
              tool(curriculum, {
                action: "syllabus",
                subjectId: Number(subject),
              }),
            )
          }
        >
          Ver unidades y temas
        </button>
        <button
          disabled={task.busy}
          onClick={() =>
            task.run(() =>
              tool(curriculum, { action: "plan", subjectId: Number(subject) }),
            )
          }
        >
          Generar programa de 16 semanas
        </button>
      </div>
      <Field label="Consulta bibliográfica para práctica">
        <input
          value={references}
          onChange={(e) => setReferences(e.target.value)}
        />
      </Field>
      <Field label="Tipo de notebook">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="finance">Finanzas · valor presente neto</option>
          <option value="statistics">Estadística · análisis descriptivo</option>
        </select>
      </Field>
      <button
        disabled={task.busy}
        onClick={() =>
          task.run(() =>
            tool(curriculum, {
              action: "activity",
              subjectId: Number(subject),
              referenceQuery: references,
              notebookKind: kind,
            }),
          )
        }
      >
        Crear práctica, PDF y notebook
      </button>
      {admin && (
        <div className="subpanel">
          <h3>Ingesta de programas</h3>
          <p className="muted">
            ZIP con TXT, Markdown, PDF o DOCX. Asocia las unidades verificadas
            en Administración.
          </p>
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="actions">
            <button
              disabled={!file || task.busy}
              onClick={() =>
                task.run(async () =>
                  tool(curriculum, {
                    action: "ingest",
                    uploadId: await upload(file!, "zip"),
                    subjectId: Number(subject),
                  }),
                )
              }
            >
              Importar ZIP
            </button>
            <button
              disabled={task.busy}
              onClick={() =>
                task.run(() => tool(curriculum, { action: "index" }))
              }
            >
              Crear embeddings pendientes
            </button>
          </div>
        </div>
      )}
      <Status task={task} />
      <Result value={task.result} />
    </section>
  );
}
function schoolEpoch(date: string, hour: number) {
  let t = Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(t));
    const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
    const represented = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`,
    );
    t +=
      Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) -
      represented;
  }
  return Math.floor(t / 1000);
}
function Schedules({ admin }: { admin: boolean }) {
  const task = useTask(),
    [offering, setOffering] = useState("1"),
    [date, setDate] = useState(""),
    [duration, setDuration] = useState("1"),
    [startHour, setStartHour] = useState("8"),
    [session, setSession] = useState(""),
    [commit, setCommit] = useState(false);
  function solve() {
    if (!date) throw Error("Selecciona una fecha");
    const base = new Date(`${date}T12:00:00Z`);
    const slots = [];
    for (let d = 0; d < 5; d++) {
      const day = new Date(base);
      day.setUTCDate(base.getUTCDate() + d);
      for (let h = Number(startHour); h < Number(startHour) + 8; h++)
        slots.push(schoolEpoch(day.toISOString().slice(0, 10), h));
    }
    return tool(scheduler, {
      action: "solve",
      offeringIds: offering.split(",").map(Number),
      slotStarts: slots,
      duration: Number(duration),
      commit,
    });
  }
  return (
    <section>
      <h2>Horarios y cierre de sesiones</h2>
      <button
        disabled={task.busy}
        onClick={() => task.run(() => tool(scheduler, { action: "list" }))}
      >
        Consultar mi horario
      </button>
      {admin && (
        <div className="subpanel">
          <h3>Generación automática</h3>
          <Field label="IDs de ofertas separados por coma">
            <input
              value={offering}
              onChange={(e) => setOffering(e.target.value)}
            />
          </Field>
          <div className="grid">
            <Field label="Primer día · cinco días consecutivos">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Jornada">
              <select
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
              >
                <option value="8">Matutina · 08:00–16:00</option>
                <option value="16">Vespertina · 16:00–00:00</option>
              </select>
            </Field>
            <Field label="Duración de sesión en horas">
              <input
                type="number"
                min="1"
                max="8"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={commit}
              onChange={(e) => setCommit(e.target.checked)}
            />
            Guardar sesiones generadas
          </label>
          <button disabled={task.busy} onClick={() => task.run(solve)}>
            {commit ? "Generar y guardar" : "Previsualizar horario"}
          </button>
          <p className="muted">
            Se completa la carga semanal de cada oferta. Captura disponibilidad
            y acreditación docente antes de generar.
          </p>
        </div>
      )}
      <Id
        label="ID de sesión terminada"
        value={session}
        onChange={setSession}
      />
      <div className="actions">
        <button
          disabled={task.busy || !session}
          onClick={() =>
            task.run(() =>
              tool(scheduler, { action: "close", sessionId: Number(session) }),
            )
          }
        >
          Cerrar lista de asistencia
        </button>
        {admin && (
          <button
            className="secondary"
            disabled={task.busy || !session}
            onClick={() =>
              task.run(() =>
                tool(scheduler, {
                  action: "cancel",
                  sessionId: Number(session),
                }),
              )
            }
          >
            Cancelar sesión
          </button>
        )}
      </div>
      <Status task={task} />
      <Result value={task.result} />
    </section>
  );
}
export function FacialAttendance({ admin }: { admin: boolean }) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true),
    currentSession = useRef(""),
    dialog = useRef<HTMLDialogElement>(null),
    scanInFlight = useRef(false),
    scanRunner = useRef<() => Promise<number>>(async()=>2200);
  const [active, setActive] = useState(false),
    [session, setSession] = useState(""),
    [student, setStudent] = useState(""),
    [studentIdentity, setStudentIdentity] = useState<{name:string;number:string;list_number?:number} | null>(null),
    [mode, setMode] = useState<"attendance" | "enroll">("attendance"),
    [identityConfirmed, setIdentityConfirmed] = useState(false),
    [consent, setConsent] = useState(false),
    [supervised, setSupervised] = useState(false);
  const [opened, setOpened] = useState(false);
  const [autoPaused,setAutoPaused] = useState(false);
  const [classContext, setClassContext] = useState<Row | null>(null);
  const [search, setSearch] = useState("");
  const [lastRegistered, setLastRegistered] = useState("");
  const [lastRecognition,setLastRecognition] = useState<{name:string;number:string;at:number;duplicate:boolean}|null>(null);
  const [clock, setClock] = useState(Date.now());
  const [notice, setNotice] = useState<{kind:"success"|"warning"|"error"|"working"|"ready";title:string;detail:string} | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const task = useTask();
  async function perform(fn: () => Promise<any>) {
    setNotice({kind:"working",title:"Procesando",detail:"Espera la confirmación del sistema antes de continuar."});
    return task.run(async () => {
      try {
        const result = await fn();
        setNotice(previous => previous?.kind === "working" ? {kind:"ready",title:"Captura preparada",detail:"Sigue las indicaciones de la cámara."} : previous);
        return result;
      } catch (error) {
        setNotice({kind:"error",title:"No se completó",detail:error instanceof Error ? error.message : "Revisa la cámara y vuelve a intentarlo."});
        throw error;
      }
    });
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function attendanceAction(payload: Row) {
    const result = await tool(biometrics, payload);
    const id = result?.studentId ?? result?.enrolled ?? result?.deleted;
    if (!id) return result;
    let identity = String(id) === student ? studentIdentity : null;
    if (!identity) {
      try {
        const students = await request("records/students");
        const matched = students.find((s: Row) => s.id === id);
        if (matched) identity = {name:matched.name, number:matched.number};
      } catch { /* La asistencia ya se guardó; una consulta de nombre no la repite. */ }
    }
    const display = identity ? `${identity.name} · Matrícula ${identity.number}` : "Alumno identificado por el sistema";
    const nextNotice = result.alreadyRecorded
      ? {kind:"warning" as const,title:"Asistencia ya registrada",detail:`${display}. Ya se tomó asistencia en esta clase; no se duplicó el registro.`}
      : result.alreadyRegistered
      ? {kind:"warning" as const,title:"Rostro ya registrado",detail:`${display}. Utiliza la asistencia con rostro registrado; este intento no añadió asistencia.`}
      : payload.action === "enroll"
      ? {kind:"success" as const,title:"Registro inicial completado",detail:`${display}. Biometría guardada en su matrícula${result.attendanceRegistered ? " y asistencia acreditada en esta clase" : ""}.`}
      : payload.action === "delete"
      ? {kind:"ready" as const,title:"Registro facial eliminado",detail:display}
      : {kind:"success" as const,title:result.status === "present" ? "Asistencia registrada" : "Registro manual guardado",detail:`${display}. ${payload.action === "verify" ? "Alumno con biometría ya registrada: rostro reconocido y asistencia guardada en el sistema." : "El sistema confirmó el registro solicitado."}`};
    setNotice(nextNotice);
    if(payload.action === "verify" && identity) setLastRecognition({...identity,at:Date.now(),duplicate:!!result.alreadyRecorded});
    if (!result.alreadyRegistered) {
      setRefreshRevision(value => value + 1);
      
      if (payload.action === "enroll") {setConsent(false);setIdentityConfirmed(false);setLastRegistered(String(id));}
    }
    if (!identity) return result;
    return {...result, ...(result.studentId !== undefined ? {studentId:display} : {}),
      ...(result.enrolled !== undefined ? {enrolled:display} : {}),
      ...(result.deleted !== undefined ? {deleted:display} : {})};
  }
  async function start() {
    const s = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    if (!mounted.current || !dialog.current?.open) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = s;
    if (video.current) video.current.srcObject = s;
    setActive(true);
  }
  function frame() {
    const v = video.current;
    if (!v?.videoWidth) throw Error("Activa la cámara");
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    return c.toDataURL("image/jpeg", 0.85);
  }
  function resetPerson() {
    setStudent("");setStudentIdentity(null);setConsent(false);setIdentityConfirmed(false);setNotice(null);setSearch("");
  }
  function selectPerson(value: string) {
    resetPerson();
    const selected = classContext?.students.find((s:Row) => String(s.id) === value && !s.biometric);
    if (selected) {setStudent(String(selected.id));setStudentIdentity({name:selected.name,number:selected.number,list_number:selected.list_number});}
  }
  function openCapture(nextMode: "attendance" | "enroll") {
    resetPerson();setLastRecognition(null);setLastRegistered("");setSupervised(false);setAutoPaused(false);setMode(nextMode);setOpened(true);
  }
  function closeCapture() { if (!task.busy) setOpened(false); }
  function nextPerson() {
    resetPerson();
    if (mode === "enroll") {
      const next = classContext?.students.filter((s:Row) => !s.biometric && String(s.id) !== lastRegistered)
        .sort((a:Row,b:Row) => (a.list_number ?? 9999)-(b.list_number ?? 9999) || a.name.localeCompare(b.name,"es"))[0];
      if (next) selectPerson(String(next.id));
      else setNotice({kind:"ready",title:"Lista completada",detail:"No quedan alumnos pendientes de registro biométrico en este grupo."});
    } else setNotice({kind:"ready",title:"Siguiente alumno",detail:"Coloca a la siguiente persona frente a la cámara e inicia la verificación."});
  }
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()),1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!opened) return;
    dialog.current?.showModal();
    void perform(start);
    return () => {
      dialog.current?.close();
      stream.current?.getTracks().forEach(t => t.stop());
      stream.current=null;setActive(false);
    };
  }, [opened]);
  useEffect(() => {
    if (opened && (!session || !classContext || clock / 1000 >= classContext.ends)) {
      setOpened(false);
      setNotice({kind:"warning",title:"Clase finalizada o cambiada",detail:"Confirma nuevamente docente y grupo antes de abrir la captura."});
    }
  }, [session, classContext, opened, clock]);
  scanRunner.current = async () => {
    if (!video.current?.videoWidth || document.visibilityState !== "visible") return 900;
    const result = await perform(async () => {
      try {
        const images = [frame()];
        for (let i=0;i<2;i++) {
          await new Promise(resolve => setTimeout(resolve,180));
          if (!dialog.current?.open || !stream.current) return null;
          images.push(frame());
        }
        const challenge = await request("attendance/challenge",{sessionId:Number(session)});
        return await attendanceAction({action:"verify",sessionId:Number(session),challengeId:challenge.challengeId,frames:images,captureMode:"passive",supervised:true});
      } catch(error) {
        const message=error instanceof Error ? error.message : String(error);
        if (/único rostro|demasiado pequeño|borrosa|oscura|Identidad no confirmada/.test(message)) {
          setNotice({kind:"ready",title:"Esperando un rostro reconocible",detail:message+". No se registró asistencia; la cámara volverá a comprobar automáticamente."});
          return {waiting:true};
        }
        setAutoPaused(true);
        throw error;
      }
    });
    return result?.waiting ? 900 : result ? 2600 : 4000;
  };
  useEffect(() => {
    if (!opened || !active || !supervised || mode !== "attendance" || autoPaused || !session) return;
    let stopped=false;
    const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
    const loop=async()=>{
      await wait(700);
      while (!stopped) {
        let delay=900;
        if (!scanInFlight.current && document.visibilityState === "visible") {
          scanInFlight.current=true;
          try {delay=await scanRunner.current();} finally {scanInFlight.current=false;}
        }
        await wait(delay);
      }
    };
    void loop();
    return ()=>{stopped=true;};
  },[opened,active,supervised,mode,autoPaused,session]);
  const time = (stamp:number) => new Date(stamp*1000).toLocaleTimeString("es-MX",{timeZone:"America/Mexico_City",hour:"2-digit",minute:"2-digit"});
  const pending = (classContext?.students || []).filter((s:Row) => !s.biometric && String(s.id) !== lastRegistered)
    .sort((a:Row,b:Row) => (a.list_number ?? 9999)-(b.list_number ?? 9999) || a.name.localeCompare(b.name,"es"));
  const filtered = pending.filter((s:Row) => !search.trim() || `${s.name} ${s.number} ${s.list_number ?? ""}`.toLocaleLowerCase("es-MX").includes(search.trim().toLocaleLowerCase("es-MX")));
  const ready = !!session && !!classContext && clock/1000 >= classContext.starts && clock/1000 < classContext.ends;
  return (
    <section className="attendance-home">
      <div className="attendance-heading"><div><small>CONTROL DE ASISTENCIA</small><h2>Tu clase, en tiempo real</h2><p>Elige docente y confirma el grupo del horario actual.</p></div><span className="attendance-clock">{new Date(clock).toLocaleString("es-MX",{timeZone:"America/Mexico_City"})}</span></div>
      {admin && <RosterAdmin onChanged={() => setRefreshRevision(v => v+1)} />}
      <fieldset className="attendance-context" disabled={task.busy || opened}>
        <AttendanceContext refreshRevision={refreshRevision} registrationMode={false} onClass={setClassContext}
          captureActions={<div className="capture-launchers">
        <button className="capture-launch" disabled={!ready || task.busy} onClick={() => openCapture("attendance")}><span className="capture-launch-icon">◎</span><span><strong>Tomar asistencia</strong><small>Reconocer rostros ya registrados, en cualquier orden</small></span><span>↗</span></button>
        {admin && <button className="capture-launch secondary" disabled={!ready || task.busy} onClick={() => openCapture("enroll")}><span className="capture-launch-icon">＋</span><span><strong>Registro por primera vez</strong><small>Elegir alumno, guardar rostro y acreditar asistencia</small></span><span>↗</span></button>}
      </div>}
          onSelectionClear={resetPerson} onStudent={(id,identity) => {setStudent(id);setStudentIdentity(identity);}}
          onSession={id => {if(id !== currentSession.current) resetPerson();currentSession.current=id;setSession(id);}} />
      </fieldset>
      {!ready && <p className="muted">Las ventanas de captura se habilitan al confirmar una clase vigente.</p>}
      {!opened && notice && <p role="status">{notice.title}: {notice.detail}</p>}
      <dialog ref={dialog} className="capture-dialog" aria-labelledby="capture-dialog-title" onCancel={e => {e.preventDefault();closeCapture();}} onClick={e => {if(e.target===dialog.current) closeCapture();}}>
        <header className="capture-dialog-header"><div><small>{mode === "enroll" ? "ALTA BIOMÉTRICA" : "ASISTENCIA FACIAL"}</small><h2 id="capture-dialog-title">{mode === "enroll" ? "Primer registro del alumno" : "Reconocimiento y asistencia"}</h2><p>{classContext?.teacher} · {classContext?.group_code} · {classContext?.subject}</p></div><button disabled={task.busy} onClick={closeCapture} aria-label="Cerrar ventana de captura">×</button></header>
        <div className="capture-class-strip"><span>{classContext ? `${time(classContext.starts)}–${time(classContext.ends)}` : ""}</span><span>{new Date(clock).toLocaleDateString("es-MX",{timeZone:"America/Mexico_City"})}</span><span className="capture-live">● {active ? "Cámara activa" : "Cámara detenida"}</span></div>
        <div className="capture-dialog-body">
          <div className="capture-camera-column">
            <div className="capture-camera-stage"><video ref={video} autoPlay muted playsInline /><div className="capture-camera-guide" aria-hidden="true" /><span>{active ? "Una persona a la vez · rostro centrado" : "Permite el acceso a la cámara para comenzar"}</span></div>
            {mode === "enroll" ? <div className="capture-authorization">
              <label className="check"><input type="checkbox" checked={identityConfirmed} disabled={task.busy || !studentIdentity} onChange={e => setIdentityConfirmed(e.target.checked)} />Confirmo que la persona es {studentIdentity ? `${studentIdentity.name} · ${studentIdentity.number}` : "el alumno seleccionado"}</label>
              <label className="check"><input type="checkbox" checked={consent} disabled={task.busy || !studentIdentity} onChange={e => setConsent(e.target.checked)} />El alumno otorgó consentimiento para guardar su rostro</label>
            </div> : <label className="check capture-authorization"><input type="checkbox" checked={supervised} disabled={task.busy} onChange={e => setSupervised(e.target.checked)} />El docente supervisa esta captura</label>}
            <div className="actions"><button className="secondary" disabled={task.busy || active} onClick={() => perform(start)}>Activar cámara</button><button className="secondary" disabled={task.busy || !active} onClick={() => {stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setActive(false);}}>Apagar cámara</button></div>
          </div>
          <div className="capture-work-column">
            {mode === "enroll" ? <>
              <div className="capture-panel-heading"><h3>Alumno que vas a registrar</h3><span>{pending.length} pendientes</span></div>
              <label>Buscar en la lista<input disabled={task.busy} value={search} onChange={e => {setSearch(e.target.value);setStudent("");setStudentIdentity(null);setConsent(false);setIdentityConfirmed(false);}} placeholder="Nombre, matrícula o NL" /></label>
              <label>Elegir alumno<select disabled={task.busy} value={student} onChange={e => selectPerson(e.target.value)}><option value="">Selecciona un alumno del grupo</option>{filtered.map((s:Row) => <option key={s.id} value={s.id}>{s.list_number ? `NL ${s.list_number} · ` : ""}{s.name} · {s.number}</option>)}</select></label>
              <div className="capture-identity"><small>IDENTIDAD ASIGNADA</small><strong>{studentIdentity?.name || "Sin alumno seleccionado"}</strong><span>{studentIdentity ? `Matrícula ${studentIdentity.number}${studentIdentity.list_number ? ` · NL ${studentIdentity.list_number}` : ""}` : "Selecciona antes de guardar la biometría"}</span></div>
              <button className="capture-primary" disabled={task.busy || !ready || !active || !student || !consent || !identityConfirmed} onClick={() => perform(() => attendanceAction({action:"enroll",sessionId:Number(session),studentId:Number(student),studentNumber:studentIdentity!.number,frame:frame(),consent:true}))}>Guardar rostro y asistencia</button>
            </> : <>
              <h3>Identificación sin selección previa</h3><p>La cámara busca al alumno entre los inscritos en este grupo. No importa el orden de llegada.</p>
              <p className="muted">Detección automática: el alumno solo se coloca frente a la cámara unos instantes. No necesita pulsar botones, girar la cabeza ni seguir pasos. Espera el aviso antes de salir del área de la cámara.</p>
              {lastRecognition && <div className="capture-identity"><small>ÚLTIMO ALUMNO RECONOCIDO · {new Date(lastRecognition.at).toLocaleTimeString("es-MX")}</small><strong>{lastRecognition.name}</strong><span>Matrícula {lastRecognition.number} · {lastRecognition.duplicate ? "Ya tenía asistencia; no se duplicó" : "Asistencia guardada"}</span></div>}
              <div className="passive-indicator" role="status"><span className={active&&supervised&&!autoPaused?"passive-dot active":"passive-dot"}/>{!supervised?"Activa la supervisión docente para iniciar":autoPaused?"Reconocimiento pausado":active?"Reconocimiento automático activo":"Esperando cámara"}</div>
              <button className="secondary" disabled={!active||!supervised} onClick={()=>setAutoPaused(value=>!value)}>{autoPaused?"Reanudar reconocimiento":"Pausar nuevas capturas"}</button>
              <small>La confirmación usa varias imágenes automáticas y una sola identidad del grupo. No sustituye la supervisión ni constituye una prueba de vida.</small>
            </>}
            <div className={`capture-result ${notice?.kind || "ready"}`} role={notice?.kind === "error" ? "alert" : "status"} aria-live="polite"><span className="capture-result-icon">{notice?.kind === "success" ? "✓" : notice?.kind === "error" ? "!" : notice?.kind === "working" ? "◌" : "◎"}</span><div><strong>{notice?.title || "Listo para capturar"}</strong><p>{notice?.detail || "El resultado aparecerá aquí después de la confirmación del sistema."}</p></div></div>
          </div>
        </div>
        <footer className="capture-dialog-footer"><small>Una asistencia por alumno y clase. Los duplicados se conservan como un único registro.</small><div className="actions"><button className="secondary" disabled={task.busy} onClick={closeCapture}>Cerrar</button>{mode === "enroll" && <button disabled={task.busy || !ready || !notice || !["success","warning"].includes(notice.kind)} onClick={nextPerson}>Siguiente alumno →</button>}</div></footer>
      </dialog>
    </section>
  );
}

function Grades() {
  const [offering, setOffering] = useState("1"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [approved, setApproved] = useState(false),
    task = useTask();
  return (
    <section>
      <h2>Calificaciones · 20% / 20% / 60%</h2>
      <Id
        label="ID de oferta académica"
        value={offering}
        onChange={(v) => {
          setOffering(v);
          setPreview(null);
        }}
      />
      <p className="muted">
        XLSX, primera hoja: student_id, p1, p2, final_exam. Escala 0–100, sin
        fórmulas. Cierra todas las sesiones antes de publicar.
      </p>
      <input
        type="file"
        accept=".xlsx"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setPreview(null);
        }}
      />
      <div className="actions">
        <button
          disabled={!file || task.busy}
          onClick={() =>
            task.run(async () => {
              const result = await tool(grades, {
                action: "preview",
                uploadId: await upload(file!, "xlsx"),
                offeringId: Number(offering),
              });
              setPreview(result.previewId);
              setApproved(false);
              return result.rows;
            })
          }
        >
          Validar y previsualizar XLSX
        </button>
        <button
          className="secondary"
          disabled={task.busy}
          onClick={() =>
            task.run(() =>
              tool(grades, { action: "list", offeringId: Number(offering) }),
            )
          }
        >
          Consultar notas y faltas
        </button>
      </div>
      {preview && (
        <>
          <label className="check">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
            />
            Revisé las filas y apruebo publicar estas calificaciones
          </label>
          <button
            disabled={!approved || task.busy}
            onClick={() =>
              task.run(() =>
                tool(grades, {
                  action: "commit",
                  previewId: preview,
                  approved: true,
                }),
              )
            }
          >
            Publicar calificaciones
          </button>
        </>
      )}
      <Status task={task} />
      <Result value={task.result} />
    </section>
  );
}
export function SurveyDashboard() {
  const [title, setTitle] = useState("Experiencia académica"),
    [questions, setQuestions] = useState([
      { prompt: "¿Qué mejorarías del programa?", kind: "text", options: "" },
    ]),
    [survey, setSurvey] = useState(""),
    [mine, setMine] = useState<Row[]>([]),
    [count, setCount] = useState("1"),
    [links, setLinks] = useState<string[]>([]),
    [analysis, setAnalysis] = useState<Row | null>(null),
    [qual, setQual] = useState(""),
    [label, setLabel] = useState("Docencia"),
    [parent, setParent] = useState(""),
    [response, setResponse] = useState(""),
    [code, setCode] = useState(""),
    [quote, setQuote] = useState("");
  const task = useTask();
  async function refresh() {
    setMine(await request("surveys"));
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function analyze(ai: boolean) {
    const a = await tool(surveys, {
      action: "analyze",
      surveyId: Number(survey),
      qualitative: ai,
    });
    setAnalysis(a);
    if (a.qualitative) setQual(a.qualitative);
    return null;
  }
  return (
    <section>
      <h2>Encuestas y grupos focales</h2>
      <div className="subpanel">
        <h3>Crear encuesta o entrevista de seguimiento</h3>
        <Field label="Título">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        {questions.map((q, i) => (
          <div key={i} className="question">
            <Field label={`Pregunta ${i + 1}`}>
              <input
                value={q.prompt}
                onChange={(e) =>
                  setQuestions((old) =>
                    old.map((x, j) =>
                      j === i ? { ...x, prompt: e.target.value } : x,
                    ),
                  )
                }
              />
            </Field>
            <Field label="Tipo de respuesta">
              <select
                value={q.kind}
                onChange={(e) =>
                  setQuestions((old) =>
                    old.map((x, j) =>
                      j === i ? { ...x, kind: e.target.value } : x,
                    ),
                  )
                }
              >
                <option value="text">Texto</option>
                <option value="rating">Valoración 1–5</option>
                <option value="choice">Opción única</option>
                <option value="audio">Audio</option>
              </select>
            </Field>
            {q.kind === "choice" && (
              <Field label="Opciones separadas por coma">
                <input
                  value={q.options}
                  onChange={(e) =>
                    setQuestions((old) =>
                      old.map((x, j) =>
                        j === i ? { ...x, options: e.target.value } : x,
                      ),
                    )
                  }
                />
              </Field>
            )}
            <button
              className="secondary"
              disabled={questions.length === 1}
              onClick={() =>
                setQuestions((old) => old.filter((_, j) => j !== i))
              }
            >
              Quitar pregunta
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            className="secondary"
            onClick={() =>
              setQuestions((old) => [
                ...old,
                { prompt: "", kind: "text", options: "" },
              ])
            }
          >
            Añadir pregunta
          </button>
          <button
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                const r = await tool(surveys, {
                  action: "create",
                  title,
                  questions: questions.map((q) => ({
                    prompt: q.prompt,
                    kind: q.kind,
                    ...(q.kind === "choice"
                      ? {
                          options: q.options
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : {}),
                  })),
                });
                setSurvey(String(r.id));
                await refresh();
                return r;
              })
            }
          >
            Crear encuesta
          </button>
        </div>
      </div>
      <Field label="Mis encuestas">
        <select
          value={survey}
          onChange={(e) => {
            setSurvey(e.target.value);
            setAnalysis(null);
            setLinks([]);
          }}
        >
          <option value="">Selecciona una encuesta</option>
          {mine.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} · {s.title}
            </option>
          ))}
        </select>
      </Field>
      <Id label="Número de invitaciones" value={count} onChange={setCount} />
      <div className="actions">
        <button
          disabled={!survey || task.busy}
          onClick={() =>
            task.run(async () => {
              const r = await tool(surveys, {
                action: "invite",
                surveyId: Number(survey),
                count: Number(count),
              });
              setLinks(r.links);
              return null;
            })
          }
        >
          Generar enlaces para participantes
        </button>
        <button
          disabled={!survey || task.busy}
          onClick={() => task.run(() => analyze(false))}
        >
          Calcular métricas
        </button>
        <button
          disabled={!survey || task.busy}
          onClick={() => task.run(() => analyze(true))}
        >
          Proponer análisis cualitativo con Qwen
        </button>
      </div>
      {links.length > 0 && (
        <div className="subpanel">
          <p>
            Comparte estos enlaces con los participantes. Vencen en siete días.
          </p>
          {links.map((link) => (
            <p key={link}>
              <a href={link}>{location.origin + link}</a>
            </p>
          ))}
        </div>
      )}
      {analysis && (
        <>
          <h3>Métricas cuantitativas</h3>
          <div className="metrics">
            <div>
              <span>Personas invitadas</span>
              <strong>{analysis.metrics.invited}</strong>
            </div>
            <div>
              <span>Respuestas completas</span>
              <strong>{analysis.metrics.completed}</strong>
            </div>
            <div>
              <span>Tasa de finalización</span>
              <strong>
                {analysis.metrics.completion_rate === null
                  ? "Sin denominador"
                  : `${Math.round(analysis.metrics.completion_rate * 100)}%`}
              </strong>
            </div>
          </div>
          <Table
            rows={analysis.metrics.questions.map((q: Row) => ({
              Pregunta: q.prompt,
              "Respuestas numéricas": q.rating_n,
              Promedio: q.mean,
              "Varianza muestral": q.sample_variance,
              Distribución: JSON.stringify(q.distribution),
            }))}
          />
          <h3>Tabulaciones cruzadas</h3>
          <Table
            rows={analysis.metrics.cross_tabs.map((c: Row) => ({
              "Pregunta fila": c.row_question,
              "Pregunta columna": c.column_question,
              "Valor fila": c.row_value,
              "Valor columna": c.column_value,
              Frecuencia: c.n,
            }))}
          />
          <h3>Respuestas y transcripciones</h3>
          <Table rows={analysis.responses} />
          <Field label="Análisis cualitativo editable · revisa las citas antes de exportar">
            <textarea
              rows={8}
              value={qual}
              onChange={(e) => setQual(e.target.value)}
            />
          </Field>
          <h3>Árbol de códigos</h3>
          <Table rows={analysis.codes} />
          <Field label="Etiqueta del código">
            <input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Código padre · vacío para raíz">
            <input
              type="number"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            />
          </Field>
          <button
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await tool(surveys, {
                  action: "code",
                  surveyId: Number(survey),
                  label,
                  parentId: parent ? Number(parent) : null,
                });
                return analyze(false);
              })
            }
          >
            Añadir código
          </button>
          <div className="grid">
            <Id
              label="ID de respuesta"
              value={response}
              onChange={setResponse}
            />
            <Id label="ID de código" value={code} onChange={setCode} />
          </div>
          <Field label="Cita literal de la respuesta">
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
            />
          </Field>
          <div className="actions">
            <button
              disabled={task.busy || !quote}
              onClick={() =>
                task.run(async () => {
                  await tool(surveys, {
                    action: "review",
                    surveyId: Number(survey),
                    responseId: Number(response),
                    codeId: Number(code),
                    quote,
                    confidence: 1,
                  });
                  return analyze(false);
                })
              }
            >
              Guardar codificación revisada
            </button>
            <button
              className="secondary"
              disabled={task.busy || !code}
              onClick={() =>
                task.run(async () => {
                  await tool(surveys, {
                    action: "code_update",
                    surveyId: Number(survey),
                    codeId: Number(code),
                    label,
                    parentId: parent ? Number(parent) : null,
                  });
                  return analyze(false);
                })
              }
            >
              Editar código seleccionado
            </button>
            <button
              disabled={task.busy}
              onClick={() =>
                task.run(() =>
                  tool(surveys, {
                    action: "report",
                    surveyId: Number(survey),
                    narrative: qual,
                  }),
                )
              }
            >
              Exportar reporte PDF y Markdown
            </button>
          </div>
        </>
      )}
      <Status task={task} />
      <Result value={task.result} />
    </section>
  );
}
const fields: Record<
  string,
  { label: string; type?: string; nullable?: boolean }[]
> = {
  subject_policy: [
    { label: "ID de materia", type: "number" },
    { label: "Años mínimos de experiencia", type: "number" },
    { label: 'Palabras de formación requeridas JSON: ["Finanzas"]' },
  ],
  student_create: [
    { label: "Matrícula" },
    { label: "Nombre" },
    { label: "ID de usuario vinculado", type: "number", nullable: true },
  ],
  teacher_create: [
    { label: "Nombre" },
    { label: "Formación académica" },
    { label: "Años de experiencia", type: "number" },
    { label: "ID de usuario", type: "number", nullable: true },
  ],
  program_create: [{ label: "Nombre de carrera" }],
  subject_create: [
    { label: "Código" },
    { label: "Nombre de materia" },
    { label: "Horas por semana", type: "number" },
  ],
  curriculum_create: [
    { label: "ID carrera", type: "number" },
    { label: "ID materia", type: "number" },
    { label: "Semestre", type: "number" },
  ],
  prerequisite_create: [
    { label: "ID materia", type: "number" },
    { label: "ID materia requerida", type: "number" },
  ],
  qualification_create: [
    { label: "ID docente", type: "number" },
    { label: "ID materia", type: "number" },
  ],
  group_create: [
    { label: "Código de grupo" },
    { label: "Semestre", type: "number" },
    { label: "Jornada", type: "shift" },
  ],
  room_create: [
    { label: "Nombre de aula" },
    { label: "Capacidad", type: "number" },
  ],
  offering_create: [
    { label: "ID materia", type: "number" },
    { label: "ID grupo", type: "number" },
    { label: "ID docente", type: "number" },
    { label: "Periodo: por ejemplo 2026-2" },
  ],
  enroll: [
    { label: "ID estudiante", type: "number" },
    { label: "ID oferta", type: "number" },
  ],
  unit_create: [
    { label: "ID materia", type: "number" },
    { label: "Posición", type: "number" },
    { label: "Título de unidad" },
    { label: 'Temas JSON: ["Tema","Subtema"]' },
  ],
  availability_create: [
    { label: "ID docente", type: "number" },
    { label: "Slot disponible 0–39", type: "number" },
    { label: "Jornada", type: "shift" },
  ],
  group_availability_create: [
    { label: "ID grupo", type: "number" },
    { label: "Slot disponible 0–39", type: "number" },
  ],
};
const names: Record<string, string> = {
  subject_policy: "Requisitos de perfil docente",
  student_create: "Estudiante",
  teacher_create: "Docente",
  program_create: "Carrera",
  subject_create: "Materia",
  curriculum_create: "Materia por semestre",
  prerequisite_create: "Seriación",
  qualification_create: "Acreditación docente",
  group_create: "Grupo",
  room_create: "Aula",
  offering_create: "Oferta académica",
  enroll: "Inscripción",
  unit_create: "Unidad curricular",
  availability_create: "Disponibilidad docente",
  group_availability_create: "Disponibilidad del grupo",
};
function Admin() {
  const [op, setOp] = useState("student_create"),
    [values, setValues] = useState<string[]>([]),
    [list, setList] = useState("students");
  const task = useTask();
  return (
    <section>
      <h2>Administración académica</h2>
      <Field label="Registro a crear">
        <select
          value={op}
          onChange={(e) => {
            setOp(e.target.value);
            setValues([]);
          }}
        >
          {Object.keys(fields).map((k) => (
            <option key={k} value={k}>
              {names[k]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid">
        {fields[op].map((f, i) =>
          f.label.startsWith("ID de usuario") ? null : (
            <Field key={op + i} label={f.label}>
              {f.type === "shift" ? (
                <select
                  value={values[i] ?? ""}
                  onChange={(e) =>
                    setValues((old) => {
                      const n = [...old];
                      n[i] = e.target.value;
                      return n;
                    })
                  }
                >
                  <option value="">Selecciona una jornada</option>
                  <option value="morning">Matutina</option>
                  <option value="evening">Vespertina</option>
                </select>
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={values[i] ?? ""}
                  onChange={(e) =>
                    setValues((old) => {
                      const n = [...old];
                      n[i] = e.target.value;
                      return n;
                    })
                  }
                />
              )}
            </Field>
          ),
        )}
      </div>
      <button
        disabled={task.busy}
        onClick={() =>
          task.run(() =>
            request("records", {
              op,
              params: fields[op].map((f, i) =>
                !values[i] && f.nullable
                  ? null
                  : f.type === "number"
                    ? Number(values[i])
                    : (values[i] ?? ""),
              ),
              requestId: crypto.randomUUID(),
            }),
          )
        }
      >
        Guardar registro
      </button>
      <div className="subpanel">
        <h3>Consultar registros e IDs</h3>
        <select value={list} onChange={(e) => setList(e.target.value)}>
          {[
            ["students", "Estudiantes"],
            ["teachers", "Docentes"],
            ["programs", "Carreras"],
            ["subjects", "Materias"],
            ["groups", "Grupos"],
            ["rooms", "Aulas"],
            ["offerings", "Ofertas"],
            ["biometrics", "Registros biométricos"],
          ].map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>{" "}
        <button
          disabled={task.busy}
          onClick={() => task.run(() => request(`records/${list}`))}
        >
          Consultar
        </button>
      </div>
      <Status task={task} />
      <Result value={task.result} />
    </section>
  );
}
function Respondent({ token }: { token: string }) {
  const [survey, setSurvey] = useState<Row | null>(null),
    [answers, setAnswers] = useState<Record<number, any>>({}),
    [consent, setConsent] = useState(false);
  const task = useTask();
  useEffect(() => {
    void task.run(async () => {
      const r = await request(`public/${token}`);
      setSurvey(r);
      return null;
    });
  }, [token]);
  return (
    <main className="public">
      <section>
        <h1>{survey?.title ?? "Encuesta académica"}</h1>
        <p>
          Tu respuesta se guarda localmente con un identificador pseudónimo. No
          incluyas datos personales en texto o audio.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Acepto participar en esta investigación
        </label>
        {survey?.questions.map((q: Row) => (
          <div key={q.id} className="question">
            <h3>{q.prompt}</h3>
            {q.kind === "audio" ? (
              <VoiceRecorder
                onBlob={(b) => {
                  void task.run(async () => {
                    const uploadId = await upload(b, "audio", token);
                    setAnswers((old) => ({ ...old, [q.id]: { uploadId } }));
                    return null;
                  });
                }}
              />
            ) : q.kind === "rating" ? (
              <select
                value={answers[q.id]?.rating ?? ""}
                onChange={(e) =>
                  setAnswers((old) => ({
                    ...old,
                    [q.id]: { rating: Number(e.target.value) },
                  }))
                }
              >
                <option value="">Selecciona 1–5</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            ) : q.kind === "choice" ? (
              <select
                value={answers[q.id]?.text ?? ""}
                onChange={(e) =>
                  setAnswers((old) => ({
                    ...old,
                    [q.id]: { text: e.target.value },
                  }))
                }
              >
                <option value="">Selecciona una opción</option>
                {JSON.parse(q.options_json ?? "[]").map((s: string) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ) : (
              <textarea
                value={answers[q.id]?.text ?? ""}
                onChange={(e) =>
                  setAnswers((old) => ({
                    ...old,
                    [q.id]: { text: e.target.value },
                  }))
                }
              />
            )}
          </div>
        ))}
        <button
          disabled={!consent || task.busy || !survey}
          onClick={() =>
            task.run(() =>
              request(`public/${token}`, {
                consent: true,
                answers: survey!.questions.map((q: Row) => ({
                  questionId: q.id,
                  ...answers[q.id],
                })),
              }),
            )
          }
        >
          Enviar respuestas
        </button>
        <Status task={task} />
        {task.result?.completed && (
          <p>Gracias. Tus respuestas quedaron registradas.</p>
        )}
      </section>
    </main>
  );
}
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState(
      new URLSearchParams(location.search).get("modulo") || "Inicio",
    ),
    [health, setHealth] = useState<Row>({});
  const task = useTask();
  const token = location.pathname.match(
    /^\/responder\/([A-Za-z0-9_-]{43})$/,
  )?.[1];
  useEffect(() => {
    if (token) {
      setLoading(false);
      return;
    }
    void request("me")
      .then((r) => {
        setCsrf(r.csrf);
        setUser(r.actor);
        return request("health");
      })
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);
  if (token) return <Respondent token={token} />;
  if (loading) return <main className="public">Cargando…</main>;
  if (!user)
    return (
      <main className="public">
        No se pudo conectar con el servicio local. Recarga EscoIA.
      </main>
    );
  const admin = user.roles.includes("admin"),
    teacher = admin || user.roles.includes("teacher"),
    researcher = admin || user.roles.includes("researcher");
  const tabs = [
    "Inicio",
    "Plan curricular",
    "Horarios",
    ...(teacher ? ["Asistencia", "Calificaciones"] : []),
    ...(researcher ? ["Investigación"] : []),
    ...(admin ? ["Administración"] : []),
  ];
  return (
    <div
      className={
        "layout" +
        (new URLSearchParams(location.search).get("embed") === "1"
          ? " embedded"
          : "")
      }
    >
      <aside>
        <div className="brand">
          EI<span>EscoIA</span>
        </div>
        <p className="muted">Campus local · México</p>
        <nav>
          {tabs.map((t) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header>
          <p className="eyebrow">
            Administración e investigación universitaria
          </p>
          <h1>{tab}</h1>
          <p className="muted">
            Datos y operaciones en tu Mac · zona horaria Ciudad de México
          </p>
        </header>
        <div hidden={new URLSearchParams(location.search).get("embed") === "1"}>
          <PartituraTracker />
        </div>
        {tab === "Inicio" ? (
          <Home health={health} />
        ) : tab === "Plan curricular" ? (
          <Curriculum admin={admin} />
        ) : tab === "Horarios" ? (
          <Schedules admin={admin} />
        ) : tab === "Asistencia" ? (
          <FacialAttendance admin={admin} />
        ) : tab === "Calificaciones" ? (
          <Grades />
        ) : tab === "Investigación" ? (
          <SurveyDashboard />
        ) : (
          <Admin />
        )}
      </main>
    </div>
  );
}
