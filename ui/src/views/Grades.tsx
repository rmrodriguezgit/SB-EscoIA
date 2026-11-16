import { useState } from "react";
import { tool, upload } from "../api";
import { grades } from "../lib/shared";
import { useTask, Status, Result, Id } from "../components/common";
import { AttendanceHistory } from "./AttendanceHistory";
export function Grades() {
  const [offering, setOffering] = useState("1"),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<string | null>(null),
    [approved, setApproved] = useState(false),
    task = useTask();
  return (
    <>
    <AttendanceHistory />
    <section className="no-print">
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
    </>
  );
}
