import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { payloads } from "./schemas.js";
import { tools, type DomainPort, type Principal } from "./contracts.js";
/* Actor comes from the authenticated host, NEVER model-supplied arguments.
   stdin/stdout is local host transport; stdout contains protocol messages only. */
export function createMcp(domain: DomainPort, actor: Principal) {
  const server = new McpServer({ name: "sistema-escolar", version: "0.1.0" });
  for (const tool of tools)
    server.registerTool(
      tool,
      {
        description: `Operación del Sistema Escolar: ${tool}`,
        inputSchema: {
          requestId: z.string().uuid(),
          payload: payloads[tool] as z.ZodTypeAny,
        },
      },
      async ({ requestId, payload }) => {
        try {
          await domain.authorize(actor, tool, payload);
          const result = await domain.execute(
            actor,
            tool,
            payload,
            requestId,
            AbortSignal.timeout(180000),
          );
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
          };
        } catch (e) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text:
                  e instanceof Error
                    ? e.message
                    : "Operación rechazada o servicio no disponible",
              },
            ],
          };
        }
      },
    );
  server.registerResource(
    "politica-academica",
    "sistema://politica",
    {},
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify({
            weights: [0.2, 0.2, 0.6],
            examWeeks: [6, 12, 17],
            instructionWeeks: 16,
          }),
        },
      ],
    }),
  );
  server.registerPrompt(
    "planificar-curso",
    { argsSchema: { subject: z.string().max(100) } },
    ({ subject }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Planifica ${subject} con fuentes verificadas del currículo. Semanas 6 y 12: parciales; semana 17: examen final separado. No inventes referencias.`,
          },
        },
      ],
    }),
  );
  return server;
}
export async function startMcp(domain: DomainPort, actor: Principal) {
  await createMcp(domain, actor).connect(new StdioServerTransport());
}
/* Composition root intentionally requires a real DomainPort; no fabricated
   database mutations or biometric confirmations are returned by this module. */
