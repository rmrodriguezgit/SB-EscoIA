// Cliente HTTP del servicio local. Mejoras (auditoría UI-1):
// - timeout explícito (30 s; 200 s para herramientas/LAYA, que pueden tardar)
// - respuesta no-JSON (p. ej. 502 en HTML) produce un mensaje legible
// - fallo de red indica que el servicio local no está activo
export let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
const SHORT = 30_000,
  LONG = 200_000;
async function parse(r: Response, fallback: string) {
  const type = r.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    if (r.ok) throw Error("Respuesta inesperada del servicio local");
    throw Error(`${fallback} (HTTP ${r.status})`);
  }
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? `${fallback} (HTTP ${r.status})`);
  return result;
}
async function send(url: string, init: RequestInit, timeout: number, fallback: string) {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  } catch (e) {
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw Error("El servicio local tardó demasiado en responder; intenta de nuevo");
    throw Error("No se pudo conectar con EscoIA. Verifica que esté arrancado (Iniciar-EscoIA.command)");
  }
  return parse(r, fallback);
}
export async function request(path: string, body?: unknown) {
  const long = path === "tool" || path === "run";
  return send(
    `/api/${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    long ? LONG : SHORT,
    "No se pudo completar la operación",
  );
}
export async function tool(tool: string, payload: unknown) {
  const data = await request("tool", {
    tool,
    payload,
    requestId: crypto.randomUUID(),
  });
  return data.result;
}
export async function upload(file: Blob, kind: string, token?: string) {
  const form = new FormData();
  form.append("file", file, "archivo");
  const result = await send(
    token ? `/api/public/${token}?upload=audio` : `/api/upload?kind=${kind}`,
    { method: "POST", headers: token ? {} : { "X-CSRF-Token": csrf }, body: form },
    LONG,
    "No se pudo subir el archivo",
  );
  return result.uploadId as string;
}
