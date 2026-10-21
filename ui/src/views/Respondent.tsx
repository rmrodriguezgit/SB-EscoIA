import { useEffect, useState } from "react";
import { request, upload } from "../api";
import type { Row } from "../lib/shared";
import { useTask, Status } from "../components/common";
import { VoiceRecorder } from "../components/VoiceRecorder";
export function Respondent({ token }: { token: string }) {
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
