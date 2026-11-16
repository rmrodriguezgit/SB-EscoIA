import { useState } from "react";
import { request } from "../api";
import type { Row } from "../lib/shared";
import { useTask, Status, Result } from "../components/common";
import { VoiceRecorder } from "../components/VoiceRecorder";
export function Home({ health }: { health: Row }) {
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
