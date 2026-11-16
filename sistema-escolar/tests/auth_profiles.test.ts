import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Auth, checkPin, hashPin, rolesFor } from "../server/auth.js";

/** Núcleo falso con las operaciones de perfiles; no toca la base real. */
function fakeNative() {
  const users: any[] = [{ id: 1, role: "admin", external_id: "local", password_hash: "" }];
  const teachers: any[] = [{ id: 7, name: "Docente A", user_id: null }, { id: 8, name: "Docente B", user_id: null }];
  const call = async (op: string, p: any[] = []): Promise<any> => {
    if (op === "users") return users.map(({ id, role, external_id }) => ({ id, role, external_id }));
    if (op === "user") { const u = { id: users.length + 1, role: p[0], external_id: p[1], password_hash: p[2] }; users.push(u); return { id: u.id }; }
    if (op === "teacher_accounts") return teachers;
    if (op === "teacher_link") { const t = teachers.find(t => t.id === p[1] && !t.user_id); if (t) t.user_id = p[0]; return {}; }
    if (op === "profiles") return users.filter(u => ["admin", "teacher"].includes(u.role)).map(u => {
      const t = teachers.find(t => t.user_id === u.id);
      return { user_id: u.id, role: u.role, teacher_id: t?.id ?? null, name: t?.name ?? "Administración", has_pin: u.password_hash ? 1 : 0 };
    });
    if (op === "profile_user") { const u = users.find(u => u.id === p[0]); const t = teachers.find(t => t.user_id === p[0]); return u ? [{ ...u, teacher_id: t?.id ?? null, name: t?.name ?? "Administración" }] : []; }
    if (op === "user_pin") { users.find(u => u.id === p[1]).password_hash = p[0]; return {}; }
    throw Error("op " + op);
  };
  return { call, users, teachers } as any;
}
const req = (csrf?: string) => ({ headers: csrf ? { "x-csrf-token": csrf } : {} }) as any;

test("cada docente recibe un perfil propio con roles de docente e investigador", async () => {
  const native = fakeNative(), auth = new Auth(native, join(mkdtempSync(join(tmpdir(), "perfil-")), "perfil.json"));
  await auth.initialize();
  const profiles = await auth.profiles();
  assert.deepEqual(profiles.map(p => p.role), ["admin", "teacher", "teacher"]);
  assert.equal(auth.current()?.profile.role, "admin");
  const teacher = profiles.find(p => p.teacherId === 7)!;
  const s = await auth.switchTo(teacher.userId);
  assert.deepEqual(s.actor.roles, rolesFor("teacher"));
  assert.ok(!s.actor.roles.includes("admin"));
  assert.equal(s.profile.teacherId, 7);
  await auth.profiles();
  assert.equal(native.users.length, 3, "no duplica usuarios al volver a listar");
});

test("PIN: se exige al entrar y el perfil guardado arranca bloqueado", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "perfil-")), "perfil.json");
  const native = fakeNative(), auth = new Auth(native, file);
  await auth.initialize();
  const teacher = (await auth.profiles()).find(p => p.teacherId === 8)!;
  await auth.switchTo(teacher.userId);
  await assert.rejects(auth.setPin("12"), /4 a 12/);
  await auth.setPin("2468");
  await assert.rejects(auth.switchTo(teacher.userId, "0000"), /PIN incorrecto/);
  const again = new Auth(native, file);
  await again.initialize();
  const csrf = again.current()!.csrf;
  assert.throws(() => again.require(req(csrf), true), /PERFIL_BLOQUEADO/);
  assert.equal(again.require(req(csrf), true, true).locked, true);
  const open = await again.switchTo(teacher.userId, "2468");
  assert.equal(open.locked, false);
  assert.throws(() => again.require(req(csrf), true), /CSRF_REQUIRED/, "el cambio de perfil rota el token CSRF");
});

test("hash de PIN con sal y comparación en tiempo constante", () => {
  const h = hashPin("1234");
  assert.ok(checkPin("1234", h));
  assert.ok(!checkPin("1235", h));
  assert.notEqual(hashPin("1234"), h);
  assert.ok(!checkPin("1234", ""));
});
