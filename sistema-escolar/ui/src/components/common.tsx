import { useState, type ReactNode } from "react";
import type { Row } from "../lib/shared";
export function useTask() {
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
export function Status({ task }: { task: ReturnType<typeof useTask> }) {
  return (
    <p className="status" role="status">
      {task.message}
    </p>
  );
}
export function Table({ rows }: { rows: Row[] }) {
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
                              late: "Retardo",
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
export function Result({ value }: { value: any }) {
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
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
export function Id({
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
