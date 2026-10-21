import { randomUUID } from "node:crypto";
import type { DomainPort, Principal, Tool } from "./contracts.js";
import { route } from "./models.js";
export type State =
  | "recibido"
  | "validando"
  | "ejecutando"
  | "completado"
  | "error";
export interface Event {
  runId: string;
  revision: number;
  state: State;
  agent: string;
  message: string;
  at: string;
}
const transitions: Record<State, State[]> = {
  recibido: ["validando", "error"],
  validando: ["ejecutando", "error"],
  ejecutando: ["completado", "error"],
  completado: [],
  error: [],
};
export class Orchestrator {
  constructor(
    private domain: DomainPort,
    private emit: (actor: Principal, e: Event) => Promise<void>,
  ) {}
  async run(
    actor: Principal,
    text: string,
    payload: unknown,
    signal = AbortSignal.timeout(180000),
  ) {
    if (!text.trim() || text.length > 4000) throw Error("Solicitud inválida");
    return this.flow(
      actor,
      async () => {
        const intent = await route(text, signal);
        let p = payload;
        if (!p) {
          if (intent.tool === "mcp_curriculum_tool")
            p = { action: "lookup", query: text };
          else if (intent.tool === "mcp_scheduler_tool") p = { action: "list" };
          else if (intent.tool === "mcp_biometrics_tool")
            p = { action: "sessions", query: text };
          else
            throw Error("Esta operación requiere argumentos desde su módulo");
        }
        return { tool: intent.tool, payload: p };
      },
      randomUUID(),
      signal,
    );
  }
  async runTool(
    actor: Principal,
    tool: Tool,
    payload: unknown,
    requestId: string,
    signal = AbortSignal.timeout(180000),
  ) {
    return this.flow(actor, async () => ({ tool, payload }), requestId, signal);
  }
  private async flow(
    actor: Principal,
    select: () => Promise<{ tool: Tool; payload: unknown }>,
    runId: string,
    signal: AbortSignal,
  ) {
    let state: State = "recibido",
      revision = 0;
    const event = async (next: State, agent: string, message: string) => {
      if (next !== state && !transitions[state].includes(next))
        throw Error("Transición inválida");
      state = next;
      await this.emit(actor, {
        runId,
        revision: ++revision,
        state,
        agent,
        message,
        at: new Date().toISOString(),
      });
    };
    await event("recibido", "Entrada", "Solicitud recibida");
    try {
      await event(
        "validando",
        "Reglas de autorización",
        "Validando intención, permisos y argumentos",
      );
      const selected = await select();
      signal.throwIfAborted();
      await this.domain.authorize(actor, selected.tool, selected.payload);
      await event("ejecutando", selected.tool, "Ejecutando herramienta MCP");
      const result = await this.domain.execute(
        actor,
        selected.tool,
        selected.payload,
        runId,
        signal,
      );
      await event("completado", "Sistema", "Operación completada");
      return { runId, result };
    } catch (e) {
      await event("error", "Sistema", "La operación no se pudo completar");
      throw e;
    }
  }
}
