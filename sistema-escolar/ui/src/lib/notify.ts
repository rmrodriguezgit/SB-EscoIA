// Avisos globales: los errores ya no se silencian con .catch(() => {}).
export type Notice = { id: number; message: string };
const listeners = new Set<(n: Notice) => void>();
let seq = 0;
export function notifyError(error: unknown, context?: string) {
  const detail = error instanceof Error ? error.message : String(error);
  const message = context ? `${context}: ${detail}` : detail;
  console.warn("[EscoIA]", message, error);
  const notice = { id: ++seq, message };
  listeners.forEach((l) => l(notice));
}
export function onNotice(listener: (n: Notice) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
