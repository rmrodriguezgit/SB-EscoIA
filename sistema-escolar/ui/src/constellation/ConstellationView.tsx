// Puente React → Vue: monta la constelación (Vue 3) dentro de la app React y
// le pasa eventos y estado de salud mediante un objeto reactivo de Vue.
import { useEffect, useRef } from "react";
import { createApp, h, reactive } from "vue";
import AgentConstellation from "./AgentConstellation.vue";
import type { Row } from "../lib/shared";
export function ConstellationView({
  events,
  health,
  connected,
}: {
  events: Row[];
  health: Row;
  connected: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(reactive({ events: [] as Row[], health: {} as Row, connected: false }));
  useEffect(() => {
    const s = state.current;
    const app = createApp({
      render: () => h(AgentConstellation, { events: s.events, health: s.health, connected: s.connected }),
    });
    app.mount(host.current!);
    return () => app.unmount();
  }, []);
  useEffect(() => {
    state.current.events = events;
    state.current.health = health;
    state.current.connected = connected;
  }, [events, health, connected]);
  return <div ref={host} className="constellation-host" />;
}
