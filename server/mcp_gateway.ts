import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcp } from "./mcp_server.js";
import type { DomainPort, Principal, Tool } from "./contracts.js";
export class McpGateway implements DomainPort {
  private clients = new Map<number, Client>();
  constructor(private domain: DomainPort) {}
  authorize(actor: Principal, tool: Tool, payload: unknown) {
    return this.domain.authorize(actor, tool, payload);
  }
  async execute(
    actor: Principal,
    tool: Tool,
    payload: unknown,
    requestId: string,
    signal: AbortSignal,
  ) {
    let client = this.clients.get(actor.id);
    if (!client) {
      const [a, b] = InMemoryTransport.createLinkedPair();
      const server = createMcp(this.domain, actor);
      client = new Client({ name: "partitura", version: "0.2.0" });
      await server.connect(b);
      await client.connect(a);
      this.clients.set(actor.id, client);
    }
    const result = await client.callTool(
      { name: tool, arguments: { payload, requestId } },
      undefined,
      { signal, timeout: 180000 },
    );
    const content = result.content as { type: string; text?: string }[];
    const text = content.find((c) => c.type === "text")?.text;
    if (result.isError) throw Error(text ?? "Herramienta rechazada");
    return JSON.parse(text ?? "null");
  }
  async close() {
    for (const client of this.clients.values()) await client.close();
  }
}
