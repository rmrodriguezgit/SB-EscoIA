import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { Principal } from "./contracts.js";
import type { Native, Row } from "./native.js";
import { config } from "./config.js";
export type Role = "admin" | "teacher";
export interface Profile { userId: number; role: Role; teacherId: number | null; name: string; hasPin: boolean }
export interface Session { actor: Principal; profile: Profile; csrf: string; expires: number; locked: boolean }
/** Roles efectivos de cada perfil. El docente administra sus propias investigaciones. */
export function rolesFor(role: Role): string[] {
  return role === "admin" ? ["admin"] : ["teacher", "researcher"];
}
export function hashPin(pin: string, salt = randomBytes(16).toString("base64url")) {
  return ["scrypt", salt, scryptSync(pin, salt, 32).toString("base64url")].join("$");
}
export function checkPin(pin: string, stored: string) {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const a = Buffer.from(hashPin(pin, salt).split("$")[2]), b = Buffer.from(hash);
  return a.length === b.length && timingSafeEqual(a, b);
}
const PROFILE_FILE = resolve(config.root, process.env.PROFILE_FILE ?? "data/perfil.json");
/**
 * Perfiles locales de este Mac: Administración y un perfil por docente. Sin red ni cuentas externas.
 * Un perfil con PIN arranca bloqueado hasta que se introduce el PIN.
 */
export class Auth {
  private session: Session | null = null;
  constructor(private native: Native, private file = PROFILE_FILE) {}
  async initialize() {
    const users = await this.native.call<Row[]>("users");
    if (!users.some(u => u.role === "admin")) await this.native.call("user", ["admin", "local", ""]);
    let saved = 0;
    try { saved = Number(JSON.parse(readFileSync(this.file, "utf8")).userId) || 0; } catch {}
    const profiles = await this.profiles();
    const chosen = profiles.find(p => p.userId === saved) ?? profiles.find(p => p.role === "admin");
    if (!chosen) throw Error("No se pudo preparar el contexto local");
    this.open(chosen, chosen.hasPin);
  }
  /** Cada docente obtiene un usuario local vinculado, para poder entrar con su perfil. */
  private async linkTeachers() {
    for (const t of await this.native.call<Row[]>("teacher_accounts")) {
      if (t.user_id) continue;
      const external = `docente-${t.id}`;
      let user = (await this.native.call<Row[]>("users")).find(u => u.external_id === external);
      if (!user) user = await this.native.call<Row>("user", ["teacher", external, ""]);
      if (user?.id) await this.native.call("teacher_link", [user.id, t.id]);
    }
  }
  async profiles(): Promise<Profile[]> {
    await this.linkTeachers();
    return (await this.native.call<Row[]>("profiles")).map(p => ({
      userId: p.user_id, role: p.role, teacherId: p.teacher_id ?? null, name: p.name, hasPin: !!p.has_pin,
    }));
  }
  private open(profile: Profile, locked: boolean) {
    this.session = {
      actor: { id: profile.userId, roles: rolesFor(profile.role) }, profile, locked,
      csrf: randomBytes(32).toString("base64url"), expires: Date.now() + 365 * 86400000,
    };
    return this.session;
  }
  current() { return this.session; }
  /** Cambia de perfil. Exige el PIN del perfil destino si lo tiene. */
  async switchTo(userId: number, pin = "") {
    const [user] = await this.native.call<Row[]>("profile_user", [userId]);
    if (!user || !["admin", "teacher"].includes(user.role)) throw Error("Perfil inexistente");
    if (user.password_hash && !checkPin(pin, user.password_hash)) throw Error("PIN incorrecto");
    const profile: Profile = { userId: user.id, role: user.role, teacherId: user.teacher_id ?? null, name: user.name, hasPin: !!user.password_hash };
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ userId: profile.userId }), { mode: 0o600 });
    return this.open(profile, false);
  }
  /** PIN opcional (4 a 12 dígitos) del perfil activo; vacío lo retira. */
  async setPin(pin: string) {
    const s = this.session;
    if (!s || s.locked) throw Error("Perfil bloqueado");
    if (pin && !/^\d{4,12}$/.test(pin)) throw Error("El PIN debe tener de 4 a 12 dígitos");
    await this.native.call("user_pin", [pin ? hashPin(pin) : "", s.profile.userId]);
    s.profile = { ...s.profile, hasPin: !!pin };
    return s.profile;
  }
  /** Con el perfil bloqueado solo se permite conocer el estado y elegir perfil (allowLocked). */
  require(req: IncomingMessage, mutation = false, allowLocked = false) {
    if (!this.session) throw Error("Contexto local no disponible");
    if (mutation && req.headers["x-csrf-token"] !== this.session.csrf) throw Error("CSRF_REQUIRED");
    if (this.session.locked && !allowLocked) throw Error("PERFIL_BLOQUEADO: introduce el PIN del perfil");
    return this.session;
  }
}
