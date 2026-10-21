export let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export async function request(path: string, body?: unknown) {
  const r = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? "No se pudo completar la operación");
  return result;
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
  const r = await fetch(
    token ? `/api/public/${token}?upload=audio` : `/api/upload?kind=${kind}`,
    {
      method: "POST",
      headers: token ? {} : { "X-CSRF-Token": csrf },
      body: form,
    },
  );
  const result = await r.json();
  if (!r.ok) throw Error(result.error ?? "No se pudo subir el archivo");
  return result.uploadId as string;
}
