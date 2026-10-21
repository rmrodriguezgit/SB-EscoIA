import { useState } from "react";
import { tool, upload } from "../api";
import { curriculum } from "../lib/shared";
import { useTask, Status, Result, Field, Id } from "../components/common";
export function Curriculum({ admin }: { admin: boolean }) {
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
