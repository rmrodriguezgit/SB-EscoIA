import { useEffect, useRef, useState } from "react";

export type Role = "admin" | "teacher";
export type Profile = { userId: number; role: Role; teacherId: number | null; name: string; hasPin: boolean };
export type ProfileState = { profile: Profile | null; locked: boolean; profiles: Profile[] };

/** Secciones visibles por rol. La autorización real la aplica el módulo académico (8787). */
export const SECTIONS_BY_ROLE: Record<Role, string[]> = {
  admin: ["Conversación", "Copiloto", "Biblioteca", "Memoria", "Investigaciones", "Asistencia", "Horarios", "Calificaciones", "Administración", "Tareas"],
  teacher: ["Conversación", "Copiloto", "Biblioteca", "Memoria", "Investigaciones", "Asistencia", "Horarios", "Calificaciones", "Tareas"],
};
export const roleLabel = (r?: Role) => (r === "teacher" ? "Docente" : "Administración");
export const initials = (name?: string) =>
  (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

async function call(csrf: string, body?: unknown): Promise<ProfileState> {
  const r = await fetch("/api/profile", body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "No se pudo consultar el perfil");
  return data;
}

export function useProfile(csrf: string) {
  const [state, setState] = useState<ProfileState | null>(null), [error, setError] = useState("");
  async function load() {
    try { setState(await call(csrf)); setError(""); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [csrf]);
  return {
    state, error, reload: load,
    switchTo: async (userId: number, pin = "") => { const s = await call(csrf, { userId, pin }); setState(s); return s; },
    setPin: async (pin: string) => { const s = await call(csrf, { pin_new: pin }); setState(s); return s; },
  };
}

function ProfileList({ profiles, active, onPick }: { profiles: Profile[]; active?: number; onPick: (p: Profile, pin: string) => Promise<void> }) {
  const [asking, setAsking] = useState<Profile | null>(null), [pin, setPin] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (asking) pinRef.current?.focus(); }, [asking]);
  async function go(p: Profile, value = "") {
    if (p.hasPin && !value) { setAsking(p); setPin(""); setError(""); return; }
    setBusy(true); setError("");
    try { await onPick(p, value); setAsking(null); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="profile-list">
      {profiles.map((p) => (
        <button key={p.userId} className={"profile-card" + (p.userId === active ? " active" : "")} disabled={busy} onClick={() => void go(p)}>
          <span className={"profile-avatar " + p.role}>{initials(p.name)}</span>
          <span><b>{p.name}</b><small>{roleLabel(p.role)}{p.hasPin ? " · con PIN" : ""}</small></span>
        </button>
      ))}
      {asking && (
        <form className="profile-pin" onSubmit={(e) => { e.preventDefault(); void go(asking, pin); }}>
          <label>PIN de {asking.name}
            <input ref={pinRef} type="password" inputMode="numeric" autoComplete="off" maxLength={12} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
          </label>
          <button disabled={busy || pin.length < 4}>Entrar</button>
          <button type="button" className="secondary" onClick={() => setAsking(null)}>Cancelar</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

/** Pantalla de entrada: aparece si el perfil guardado tiene PIN (arranca bloqueado). */
export function LoginScreen({ state, onPick }: { state: ProfileState; onPick: (p: Profile, pin: string) => Promise<void> }) {
  return (
    <div className="login-screen" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div className="login-card">
        <span className="mark">e</span>
        <h1 id="login-title">¿Quién usa EscoIA?</h1>
        <p>Elige tu perfil. Un docente solo ve y modifica sus propios grupos, horarios, listas e investigaciones.</p>
        <ProfileList profiles={state.profiles} active={state.profile?.userId} onPick={onPick} />
      </div>
    </div>
  );
}

/** Selector de perfil en la barra lateral, con PIN opcional del perfil activo. */
export function ProfileSwitcher({ state, onPick, onSetPin }: { state: ProfileState | null; onPick: (p: Profile, pin: string) => Promise<void>; onSetPin: (pin: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false), [pin, setPin] = useState(""), [note, setNote] = useState("");
  const p = state?.profile;
  return (
    <div className="workspace-wrap">
      <button className="workspace" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={"avatar " + (p?.role || "")}>{initials(p?.name)}</span>
        <div>{p?.name || "Perfil local"}<small>{state ? roleLabel(p?.role) + " · En este Mac" : "Comprobando perfil…"}</small></div>
        <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && state && (
        <div className="profile-menu">
          <p className="nav-label">CAMBIAR DE PERFIL</p>
          <ProfileList profiles={state.profiles} active={p?.userId} onPick={async (x, v) => { await onPick(x, v); setOpen(false); }} />
          <form className="profile-pin" onSubmit={async (e) => { e.preventDefault(); try { await onSetPin(pin); setNote(pin ? "PIN guardado: se pedirá al entrar." : "PIN retirado."); setPin(""); } catch (err) { setNote((err as Error).message); } }}>
            <label>{p?.hasPin ? "Cambiar o retirar mi PIN" : "Proteger mi perfil con PIN"}
              <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={12} placeholder={p?.hasPin ? "Vacío = retirar" : "4 a 12 dígitos"} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            </label>
            <button disabled={pin.length > 0 && pin.length < 4}>{pin || !p?.hasPin ? "Guardar PIN" : "Retirar PIN"}</button>
          </form>
          {note && <small role="status">{note}</small>}
        </div>
      )}
    </div>
  );
}
