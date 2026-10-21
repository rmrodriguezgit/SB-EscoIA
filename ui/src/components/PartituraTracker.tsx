import { useEffect, useState } from "react";
import { request } from "../api";
import { curriculum, scheduler, biometrics, grades, surveys } from "../lib/shared";
import type { Row } from "../lib/shared";
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
