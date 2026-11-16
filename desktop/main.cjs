// EscoIA — app de escritorio (Electron).
//
// Arranque:
//   1. Si EscoIA ya responde en 8790 (p. ej. iniciada con Arrancar-EscoIA.command), se usa esa copia y no se apaga al salir.
//      Si no, se lanza el coordinador (.venv/bin/python -m second_brain start) en su propio grupo de procesos.
//   2. Si el módulo académico (8787) no responde, se lanza sistema-escolar/arrancar-academico.sh, también en grupo propio.
//   3. La ventana carga http://127.0.0.1:8790/ (el coordinador sirve ui/dist), así el origen y el CSRF no cambian.
//
// Salida (cerrar ventana, Cmd+Q, menú, SIGINT/SIGTERM/SIGHUP) siempre libera la memoria:
//   - POST /api/resources/release: descarga el modelo de EscoIA (Ollama, LLMLX) y espera la confirmación;
//   - SIGTERM al grupo del coordinador (worker Uzu/LAYA incluidos), luego SIGKILL si no termina, y barrido final;
//   - el módulo académico se detiene solo si lo lanzó esta app.
//   Si hay una petición en curso se pide confirmación antes de salir.
const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const ACADEMIC_ROOT = path.resolve(ROOT, "..", "sistema-escolar");
const HOST = "127.0.0.1";
const PORT = 8790;
const URL_BASE = `http://${HOST}:${PORT}`;
const DATA = path.join(ROOT, "data");

const owned = { server: null, academic: null }; // { proc, exited } de lo que lanzó esta app
let win = null;
let closing = null;
let done = false;

const log = (...a) => console.log("[escoia-desktop]", ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function http(url, init = {}, timeout = 3000) {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => null) };
  } catch {
    return null;
  }
}
const state = () => http(`${URL_BASE}/api/state`, {}, 8000);
const escoiaUp = async () => {
  const s = await state();
  return Boolean(s?.ok && s.body && ["csrf", "library", "tasks"].every((k) => k in s.body));
};
const academicUp = async () => Boolean((await http("http://127.0.0.1:8787/api/me", {}, 2000))?.body?.csrf);

function launch(name, cmd, args, cwd, env, logFile) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, "a", 0o600);
  // detached = grupo de procesos propio: al salir se termina el proceso con todo lo que lanzó.
  const proc = spawn(cmd, args, { cwd, env, stdio: ["ignore", out, out], detached: true });
  fs.closeSync(out);
  const exited = new Promise((res) => proc.once("exit", (code, sig) => { log(`${name} terminó (code ${code}, señal ${sig})`); res(); }));
  log(`${name} lanzado (pid ${proc.pid})`);
  return { proc, exited, alive: () => proc.exitCode === null && proc.signalCode === null };
}

function startServer() {
  const py = path.join(ROOT, ".venv", "bin", "python");
  if (!fs.existsSync(py)) throw new Error("Falta el entorno .venv de EscoIA. Consulta README.md para instalarlo.");
  const pidfile = path.join(DATA, "server.pid");
  if (fs.existsSync(pidfile)) {
    const pid = Number(fs.readFileSync(pidfile, "utf8").trim());
    try { process.kill(pid, 0); throw new Error(`El PID registrado (${pid}) sigue activo pero EscoIA no responde. Revisa data/server.log.`); }
    catch (e) { if (e.code !== "ESRCH") throw e; fs.unlinkSync(pidfile); }
  }
  const env = { ...process.env, PYTHONPATH: path.join(ROOT, "src"), PYTHONUNBUFFERED: "1" };
  owned.server = launch("coordinador", py, ["-m", "second_brain", "--home", ROOT, "start", "--port", String(PORT)], ROOT, env, path.join(DATA, "server.log"));
  // Mismo registro que arrancar-escoia.sh: los scripts de terminal no inician otra copia.
  fs.writeFileSync(pidfile, String(owned.server.proc.pid), { mode: 0o600 });
}

function startAcademic() {
  const script = path.join(ACADEMIC_ROOT, "arrancar-academico.sh");
  if (!fs.existsSync(script)) { log("módulo académico no encontrado junto a EscoIA; se omite"); return; }
  owned.academic = launch("módulo académico", "/bin/bash", [script], ACADEMIC_ROOT, process.env, path.join(DATA, "logs", "academic-service.log"));
}

async function stopGroup(name, entry, graceMs) {
  if (!entry) return;
  const wait = (ms) => Promise.race([entry.exited.then(() => true), sleep(ms).then(() => false)]);
  if (entry.alive()) {
    try { process.kill(-entry.proc.pid, "SIGTERM"); } catch { /* ya no existe */ }
    if (!(await wait(graceMs))) {
      log(`${name} no terminó: SIGKILL al grupo`);
      try { process.kill(-entry.proc.pid, "SIGKILL"); } catch { /* ya no existe */ }
      await wait(2000);
    }
  }
  // Barrido: ningún hijo huérfano del grupo (Uzu, LAYA, node) sobrevive a la app.
  try { process.kill(-entry.proc.pid, "SIGKILL"); log(`barrido: quedaban procesos de ${name}, eliminados`); } catch { /* grupo vacío */ }
}

async function releaseModels() {
  const s = await state();
  if (!s?.body?.csrf) return log("EscoIA no respondió: no se pudo pedir la descarga de modelos");
  const r = await http(`${URL_BASE}/api/resources/release`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": s.body.csrf }, body: "{}",
  }, 30000);
  log(`liberación de modelos: ${r ? r.status + " " + (r.body?.message ?? r.body?.error ?? "") : "sin respuesta"}`);
}

async function finish(why) {
  if (done) return;
  done = true;
  log(`cerrando: ${why}`);
  await releaseModels();
  if (owned.server) {
    await stopGroup("coordinador", owned.server, 8000);
    const pidfile = path.join(DATA, "server.pid");
    try { if (fs.readFileSync(pidfile, "utf8").trim() === String(owned.server.proc.pid)) fs.unlinkSync(pidfile); } catch { /* sin registro */ }
  } else {
    log("EscoIA no la inició esta app: se descargaron sus modelos pero el coordinador sigue activo");
  }
  await stopGroup("módulo académico", owned.academic, 5000);
  for (const w of BrowserWindow.getAllWindows()) w.destroy();
  app.exit(0);
}

async function requestQuit(origin) {
  if (closing) return closing;
  const s = await state();
  const busy = s?.body?.resources?.pipeline_busy || (s?.body?.tasks ?? []).some((t) => t.status === "ejecutándose");
  if (busy && win && !process.env.ESCOIA_E2E) {
    const { response } = await dialog.showMessageBox(win, {
      type: "warning", buttons: ["Esperar", "Salir de todos modos"], defaultId: 0, cancelId: 0, title: "EscoIA",
      message: "Hay una petición en curso. Si sales ahora se interrumpe y se descarga el modelo.",
    });
    if (response === 0) return;
  }
  closing = finish(origin);
  return closing;
}

const SECURE = { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, "preload.cjs") };
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(URL_BASE + "/")) return { action: "allow", overrideBrowserWindowOptions: { webPreferences: SECURE } };   // descargas y fuentes servidas por EscoIA
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (e, url) => { if (!url.startsWith(URL_BASE)) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
}
// Ventanas independientes (p. ej. «Explorar» de Cuerdas): una por vista, lista cerrada.
const VIEWS = { cuerdas: "Cuerdas · EscoIA" };
const views = new Map();
ipcMain.handle("escoia:open-window", (event, view) => {
  if (!Object.hasOwn(VIEWS, view) || !event.senderFrame?.url.startsWith(URL_BASE + "/")) return false;
  const open = views.get(view);
  if (open && !open.isDestroyed()) { if (open.isMinimized()) open.restore(); open.focus(); return true; }
  const child = new BrowserWindow({ width: 1280, height: 820, minWidth: 720, minHeight: 480, title: VIEWS[view], webPreferences: SECURE });
  guard(child.webContents);
  child.on("closed", () => views.delete(view));
  child.loadURL(URL_BASE + "/?vista=" + view);
  views.set(view, child);
  return true;
});

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 880, minWidth: 900, minHeight: 600, title: "EscoIA",
    webPreferences: SECURE,
  });
  guard(win.webContents);
  win.on("close", (e) => { if (!done) { e.preventDefault(); requestQuit("ventana cerrada"); } });
  win.loadURL(URL_BASE + "/");
  // Solo para verify-exit.sh: cierra la ventana como lo haría una persona.
  const after = Number(process.env.ESCOIA_E2E_CLOSE_AFTER || 0);
  if (after > 0) win.webContents.once("did-finish-load", () => setTimeout(() => { log("e2e: cerrando la ventana"); win.close(); }, after * 1000));
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  app.setName("EscoIA");
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on("window-all-closed", () => requestQuit("todas las ventanas cerradas"));
  app.on("before-quit", (e) => { if (!done) { e.preventDefault(); requestQuit("salir de la app"); } });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => requestQuit(sig));

  app.whenReady().then(async () => {
    try {
      if (await escoiaUp()) log("EscoIA ya estaba en ejecución: se usa esa copia");
      else startServer();
      if (!(await academicUp())) startAcademic();
      for (let i = 0; i < 60 && !(await escoiaUp()); i++) {
        if (owned.server && !owned.server.alive()) throw new Error("EscoIA no pudo arrancar. Revisa data/server.log.");
        await sleep(500);
      }
      if (!(await escoiaUp())) throw new Error("EscoIA no respondió a tiempo. Revisa data/server.log.");
      createWindow();
    } catch (e) {
      dialog.showErrorBox("EscoIA", String(e.message ?? e));
      await finish("error al arrancar");
    }
  });
}
