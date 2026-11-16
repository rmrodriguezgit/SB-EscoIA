import { useEffect, useState } from "react";
import { request, tool } from "../api";
import { surveys } from "../lib/shared";
import type { Row } from "../lib/shared";
import { useTask, Status, Table, Result, Field, Id } from "../components/common";
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
