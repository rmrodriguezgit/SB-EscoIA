export function headers(token: string, admin?: string): Record<string,string> {
  return {'Content-Type': 'application/json', 'User-Agent':'EscoIA/1.0', Authorization: `Bearer ${token}`, ...(admin ? {'X-Admin-Token': admin} : {})};
}
export async function api<T>(path: string, token: string, options: RequestInit = {}, admin?: string): Promise<T> {
  const response = await fetch(path, {...options, headers: headers(token, admin)});
  if (!response.ok) {
    const error = await response.json().catch(() => null) as {detail?: unknown} | null;
    throw new Error(typeof error?.detail === 'string' ? error.detail : `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}
export async function chatStream(baseUrl: string, token: string, payload: unknown, signal: AbortSignal, onContent: (text:string)=>void) {
  const response = await fetch(`${baseUrl}/api/chat`, {method:'POST', headers:headers(token), body:JSON.stringify(payload), signal});
  if (!response.ok || !response.body) throw new Error(`Chat HTTP ${response.status}`);
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', doneEvent = false;
  try {
    while (true) {
      const {value, done} = await reader.read();
      buffer += decoder.decode(value, {stream:!done});
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0,end); buffer = buffer.slice(end+2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as {content?:string; error?:string; done?:boolean};
          if (event.error) throw new Error(event.error);
          if (event.content) onContent(event.content);
          if (event.done) doneEvent = true;
        }
      }
      if (done) break;
    }
    if (!doneEvent) throw new Error('La transmisión terminó antes de completar la respuesta');
  } finally { await reader.cancel(); reader.releaseLock(); }
}
