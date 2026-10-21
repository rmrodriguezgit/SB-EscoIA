import { randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Principal } from "./contracts.js";
import type { Native, Row } from "./native.js";
export interface Session { actor: Principal; csrf: string; expires: number }
/** Contexto interno de este Mac, sin cuentas ni contraseñas de acceso. */
export class Auth {
 private session: Session | null = null;
 constructor(private native: Native) {}
 async initialize() {
  const users = await this.native.call<Row[]>("users");
  let actor = users.find(u => u.role === "admin");
  if (!actor) {
   await this.native.call("user", ["admin", "local", ""]);
   actor = (await this.native.call<Row[]>("users")).find(u => u.role === "admin");
  }
  if (!actor) throw Error("No se pudo preparar el contexto local");
  this.session = {actor:{id:actor.id,roles:["admin"]},csrf:randomBytes(32).toString("base64url"),expires:Date.now()+365*86400000};
 }
 require(req: IncomingMessage, mutation=false) {
  if (!this.session) throw Error("Contexto local no disponible");
  if (mutation && req.headers["x-csrf-token"] !== this.session.csrf) throw Error("CSRF_REQUIRED");
  return this.session;
 }
}
