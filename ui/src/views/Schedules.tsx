import { useState } from "react";
import { tool } from "../api";
import { scheduler } from "../lib/shared";
import { useTask, Status, Result, Field, Id } from "../components/common";
export function schoolEpoch(date: string, hour: number) {
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
export function Schedules({ admin }: { admin: boolean }) {
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
