import { z } from "zod";
export const intentSchema = z
  .object({
    tool: z.enum([
      "mcp_curriculum_tool",
      "mcp_scheduler_tool",
      "mcp_biometrics_tool",
      "mcp_grades_tool",
      "mcp_surveys_tool",
    ]),
    reason: z.string().max(1000),
  })
  .strict();
export type Tool = z.infer<typeof intentSchema>["tool"];
export interface Principal {
  id: number;
  roles: string[];
}
export interface DomainPort {
  authorize(actor: Principal, tool: Tool, payload: unknown): Promise<void>;
  /* This boundary MUST perform deterministic validation and transactions in C.
    Mutation requests require a unique requestId and audit in the same transaction. */
  execute(
    actor: Principal,
    tool: Tool,
    payload: unknown,
    requestId: string,
    signal: AbortSignal,
  ): Promise<unknown>;
}
export const tools: Tool[] = [
  "mcp_curriculum_tool",
  "mcp_scheduler_tool",
  "mcp_biometrics_tool",
  "mcp_grades_tool",
  "mcp_surveys_tool",
];
