import React, { useState } from "react";
import { request, upload } from "./api";
export function AcademicFileImport({
  kind,
  teacherId,
  offeringId,
  onDone,
}: {
  kind: "lista" | "horario";
  teacherId: string;
  offeringId?: number;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File>(),
    [uid, setUid] = useState(""),
    [sheets,setSheets]=useState<string[]>([]),
    [sheet,setSheet]=useState(""),
    [metadata,setMetadata]=useState<Record<string,string>>({}),
    [rows, setRows] = useState<Record<string, string>[]>([]),
    [fields, setFields] = useState<string[]>([]),
    [text, setText] = useState(""),
    [warnings, setWarnings] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const ext = file?.name.split(".").pop()?.toLowerCase();
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="subpanel">
      <h4>
        Importar {kind === "lista" ? "lista de alumnos" : "horario"} y anexar al
        RAG
      </h4>
      <p>
        {kind === "lista"
          ? "Excel XLS/XLSX o CSV: columnas matricula, nombre."
          : "CSV, XLS/XLSX o PDF: columnas materia, grupo, aula, inicio, fin. Selecciona antes el docente y asigna sus materias."}
      </p>
      {kind === "horario" && (
        <p>
          Una fila por sesión. Fechas: 2026-10-12T08:00:00-06:00. Los PDF
          escaneados requieren OCR.
        </p>
      )}
      <input
        type="file"
        aria-label={`Archivo de ${kind}`}
        accept={kind === "lista" ? ".csv,.xls,.xlsx" : ".csv,.xls,.xlsx,.pdf"}
        disabled={busy}
        onChange={(e) => {
          setFile(e.target.files?.[0]);
          setUid("");
          setRows([]);
          setMessage("");
          setText("");
          setWarnings([]);
        }}
      />
      <button
        disabled={
          busy || !file || !teacherId || (kind === "lista" && !offeringId)
        }
        onClick={() =>
          void act(async () => {
            if (!file || !ext) return;
            const id = await upload(file, ext);
            setUid(id);
            const p = await request("academic-import", {
              action: "preview",
              uploadId: id,
              extension: ext,
              kind,
            });
            setRows(p.rows);
            setFields(p.fields);
            setWarnings(p.warnings);
            setText(p.text);setSheets(p.sheets||[]);setSheet(p.sheet||"");setMetadata(p.metadata||{});
          })
        }
      >
        {busy ? "Procesando…" : "Leer y revisar archivo"}
      </button>
      {sheets.length>0&&<label>Hoja / grupo <select value={sheet} disabled={busy} onChange={e=>void act(async()=>{const p=await request("academic-import",{action:"preview",uploadId:uid,extension:ext,kind,sheet:e.target.value});setSheet(p.sheet);setRows(p.rows);setWarnings(p.warnings);setMetadata(p.metadata||{})})}>{sheets.map(s=><option key={s} value={s}>{s}</option>)}</select></label>}
      {metadata.materia&&<p>Materia del archivo: {metadata.materia} · Grupo indicado: {metadata.grupo||"Sin indicar"}. Se registrará en el grupo y materia seleccionados arriba.</p>}
      {(!teacherId||(kind==="lista"&&!offeringId))&&<p>Selecciona primero docente, grupo y materia para habilitar la lectura.</p>}
      {warnings.map((w, i) => (
        <p key={i}>{w}</p>
      ))}
      {uid && (
        <>
          <div style={{ overflowX: "auto", maxHeight: 360 }}>
            <table>
              <thead>
                <tr>
                  {fields.map((f) => (
                    <th key={f}>{f}</th>
                  ))}
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {fields.map((f) => (
                      <td key={f}>
                        <input
                          aria-label={`${f} fila ${i + 1}`}
                          value={r[f] || ""}
                          disabled={busy}
                          onChange={(e) =>
                            setRows(
                              rows.map((v, j) =>
                                j === i ? { ...v, [f]: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <button
                        disabled={busy}
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            disabled={busy || rows.length >= 1000}
            onClick={() =>
              setRows([...rows, Object.fromEntries(fields.map((f) => [f, ""]))])
            }
          >
            Agregar fila
          </button>
          {text && ext === "pdf" && (
            <details>
              <summary>Texto del PDF para cotejar</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  maxHeight: 300,
                  overflow: "auto",
                }}
              >
                {text}
              </pre>
            </details>
          )}
          <p>
            {rows.length} filas. Comprueba matrículas, grupo, materia y fechas
            antes de confirmar.
          </p>
          <button
            disabled={
              busy ||
              !rows.length ||
              !teacherId ||
              (kind === "lista" && !offeringId)
            }
            onClick={() =>
              void act(async () => {
                const result = await request("academic-import", {
                  action: "commit",
                  uploadId: uid,
                  extension: ext,
                  kind,
                  name: (file?.name||"")+(sheet?" · "+sheet:""),
                  teacherId: Number(teacherId),
                  offeringId,
                  rows,
                });
                setMessage(
                  result.message +
                    (result.rag?.document_id
                      ? " · Fuente RAG " + result.rag.document_id
                      : ""),
                );
                if (!result.rag_pending) {
                  setUid("");
                  setRows([]);
                }
                onDone();
              })
            }
          >
            Registrar y anexar al RAG
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
