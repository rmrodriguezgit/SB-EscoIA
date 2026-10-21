import { Native } from "./native.js";
import { Domain } from "./domain.js";
import { startMcp } from "./mcp_server.js";
const native = new Native();
const id = Number(process.env.MCP_ACTOR_ID);
if (!Number.isInteger(id) || id < 1)
  throw Error("Configura MCP_ACTOR_ID con un usuario local autorizado");
const users = await native.call<any[]>("users");
const user = users.find((u) => u.id === id);
if (!user) throw Error("Usuario MCP inexistente");
await startMcp(new Domain(native), { id, roles: [user.role] });
process.on("SIGINT", () => native.close());
