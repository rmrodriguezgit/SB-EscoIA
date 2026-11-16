import {useEffect, useRef, useState} from 'react';
import {VoiceInput} from './VoiceInput';

// Cuerda del Cerebro, mismo lenguaje visual que «Cuerdas en vivo»: plana en reposo,
// vibra en ámbar mientras piensa y en turquesa mientras escucha.
function StringWave({mode, small = false}: {mode: 'idle' | 'thinking' | 'listening' | 'pending'; small?: boolean}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode); modeRef.current = mode;
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0, last = 0, amp = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < (reduced ? 500 : 33)) return; last = t;
      const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr)) {canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)}
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const m = modeRef.current;
      const target = reduced ? 0 : m === 'thinking' ? 1 : m === 'listening' ? .75 : m === 'pending' ? .3 : .08;
      amp += (target - amp) * .12;
      const color = m === 'listening' ? '#5eead4' : m === 'thinking' ? '#fbbf24' : m === 'pending' ? '#c4b5fd' : '#60a5fa';
      const mid = h / 2, x0 = small ? 4 : 10, x1 = w - x0, n = m === 'thinking' ? 3 : m === 'listening' ? 5 : 2;
      for (const [k, alpha, width] of [[1, .22, 5], [1, 1, 1.6], [.55, .45, 1]] as const) {
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 2) {
          const u = (x - x0) / (x1 - x0);
          const y = mid + Math.sin(Math.PI * n * u) * Math.sin(t / (m === 'listening' ? 90 : 140) + k * 2) * amp * (h * .36) * k
            + Math.sin(Math.PI * (n + 2) * u) * Math.cos(t / 210) * amp * h * .08;
          x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.shadowColor = color; ctx.shadowBlur = width > 2 ? 10 : 0; ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.fillStyle = '#e6ecff';
      for (const x of [x0, x1]) {ctx.beginPath(); ctx.arc(x, mid, small ? 2 : 3, 0, Math.PI * 2); ctx.fill()}
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [small]);
  return <canvas ref={ref} className={small ? 'cerebro-wave small' : 'cerebro-wave'} aria-hidden />;
}

function speak(text: string) {
  try {
    const synth = window.speechSynthesis; if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/\[\d+\]/g, '').slice(0, 1200));
    u.lang = 'es-MX';
    const voice = synth.getVoices().find(v => v.lang.startsWith('es') && v.localService);
    if (voice) u.voice = voice;
    synth.speak(u);
  } catch {/* sin síntesis de voz */}
}

// Cerebro flotante (abajo a la derecha): responde cualquier consulta y propone acciones.
// Nada se ejecuta hasta que la persona pulsa «Aceptar»; las acciones de la ventana principal
// (consulta, abrir) las realiza App mediante onRun.
export type CerebroUi = {type: 'consulta' | 'abrir'; text: string};
type Action = {type: string; title: string; reason: string; text: string; status: string; outcome?: string};
type Turn = {role: 'user' | 'assistant'; text: string; id?: string; actions?: Action[]; context?: string[]; seconds?: number; error?: boolean};

const LABEL: Record<string, string> = {consulta: 'Conversación', abrir: 'Abrir sección', recordar: 'Memoria', tarea: 'Tarea en cola', liberar_memoria: 'Recursos'};
const ICON: Record<string, string> = {consulta: '✧', abrir: '↗', recordar: '◇', tarea: '◷', liberar_memoria: '⟲'};

export function Cerebro({csrf, busy, onRun}: {csrf: string; busy: boolean; onRun: (ui: CerebroUi) => void}) {
  const [open, setOpen] = useState(() => {try {return localStorage.getItem('escoia.cerebro') === '1'} catch {return false}});
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [working, setWorking] = useState('');
  const [note, setNote] = useState<Record<string, string>>({});
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(() => {try {return localStorage.getItem('escoia.cerebro.voz') === '1'} catch {return false}});
  useEffect(() => {try {localStorage.setItem('escoia.cerebro.voz', voice ? '1' : '0')} catch {/* sin almacenamiento */}; if (!voice) window.speechSynthesis?.cancel()}, [voice]);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {try {localStorage.setItem('escoia.cerebro', open ? '1' : '0')} catch {/* sin almacenamiento */}; if (open) setTimeout(() => field.current?.focus(), 0)}, [open]);
  useEffect(() => {log.current?.scrollTo({top: log.current.scrollHeight, behavior: 'smooth'})}, [turns, thinking]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {e.preventDefault(); setOpen(true)}
      else if (e.key === 'Escape' && open && document.activeElement && (document.activeElement as HTMLElement).closest('.cerebro-panel')) setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  async function post(path: string, body: unknown) {
    const r = await fetch('/api/' + path, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': csrf}, body: JSON.stringify(body)});
    const data = await r.json();
    if (!r.ok) throw Error(data.error || 'Error del servicio');
    return data;
  }

  async function ask(spoken?: string) {
    const question = (spoken ?? input).trim();
    if (!question || thinking) return;
    const history = turns.filter(t => !t.error).slice(-6).map(t => ({role: t.role, text: t.text}));
    setTurns(t => [...t, {role: 'user', text: question}]); setInput(''); setThinking(true);
    try {
      const plan = await post('cerebro', {question, history});
      setTurns(t => [...t, {role: 'assistant', text: plan.answer, id: plan.id, actions: plan.actions, context: plan.context, seconds: plan.seconds}]);
      // Con voz: responde en voz alta si se le habló o si la voz está activada.
      if (spoken !== undefined || voice) speak(plan.answer + (plan.actions?.length ? '. Te propongo ' + plan.actions.length + (plan.actions.length === 1 ? ' acción' : ' acciones') + '; acéptalas en el panel.' : ''));
    } catch (e) {
      setTurns(t => [...t, {role: 'assistant', text: (e as Error).message, error: true}]);
    } finally {setThinking(false)}
  }

  async function decide(turn: Turn, index: number, decision: 'accept' | 'reject') {
    if (!turn.id) return;
    const key = turn.id + ':' + index; setWorking(key); setNote(n => ({...n, [key]: ''}));
    try {
      const r = await post('cerebro/decision', {id: turn.id, index, decision});
      setTurns(ts => ts.map(t => t.id === turn.id ? {...t, actions: t.actions?.map((a, i) => i === index ? r.action : a)} : t));
      if (r.ui) onRun(r.ui as CerebroUi);
      setNote(n => ({...n, [key]: r.message || (decision === 'reject' ? 'Descartada' : '')}));
    } catch (e) {setNote(n => ({...n, [key]: (e as Error).message}))}
    finally {setWorking('')}
  }

  const mode = listening ? 'listening' : thinking ? 'thinking' : 'idle';
  const pending = turns.reduce((n, t) => n + (t.actions?.filter(a => a.status === 'propuesta').length || 0), 0);

  if (!open) return <button className="cerebro-launcher" onClick={() => setOpen(true)} aria-label="Abrir el Cerebro (⌘K)" title="Cerebro · ⌘K">
    <StringWave small mode={thinking ? 'thinking' : pending ? 'pending' : 'idle'} /><span>Cerebro</span>{pending > 0 && <b aria-label={pending + ' acciones pendientes'}>{pending}</b>}
  </button>;

  return <div className="cerebro-panel" role="dialog" aria-label="Cerebro de EscoIA">
    <header>
      <div className="cerebro-title"><strong>Cerebro</strong><small>{listening ? 'Escuchando… pulsa ■ para enviar' : thinking ? 'Vibrando · LLMLX genera la respuesta' : 'Cualquier consulta · propone, tú decides'}</small></div>
      <button className={'cerebro-icon' + (voice ? ' on' : '')} onClick={() => setVoice(v => !v)} title={voice ? 'Respuestas en voz alta: activadas' : 'Leer respuestas en voz alta'} aria-pressed={voice} aria-label="Respuestas en voz alta">{voice ? '🔊' : '🔈'}</button>
      {turns.length > 0 && <button className="cerebro-icon" onClick={() => {setTurns([]); setNote({})}} title="Nueva conversación" aria-label="Nueva conversación">＋</button>}
      <button className="cerebro-icon" onClick={() => setOpen(false)} title="Minimizar (Esc)" aria-label="Minimizar el Cerebro">–</button>
    </header>
    <StringWave mode={mode} />
    <div className="cerebro-log" ref={log} aria-live="polite">
      {turns.length === 0 && <div className="cerebro-empty">
        <p>Escríbeme o pulsa 🎙 y háblame. Pregúntame lo que necesites. Si conviene hacer algo —enviar una consulta con fuentes, abrir un módulo, guardar un recuerdo o encolar una tarea— te lo propongo y <strong>solo se ejecuta cuando lo aceptas</strong>, en la ventana principal.</p>
        {['¿Cómo preparo la planeación de un curso nuevo?', 'Recuérdame revisar las listas de LAN-201 el lunes', 'Necesito liberar memoria del Mac'].map(s =>
          <button key={s} onClick={() => {setInput(s); field.current?.focus()}}>{s}</button>)}
      </div>}
      {turns.map((t, ti) => <div key={ti} className={'cerebro-turn cb-' + t.role + (t.error ? ' error' : '')}>
        <p>{t.text}</p>
        {t.role === 'assistant' && !t.error && (t.context?.length || t.seconds !== undefined) && <small className="cerebro-meta">{t.seconds !== undefined && `LLMLX · ${t.seconds.toFixed(1)} s`}{t.context?.length ? ` · contexto: ${t.context.join('; ')}` : ''}</small>}
        {t.actions?.map((a, i) => {
          const key = t.id + ':' + i, wait = working === key, needsMain = a.type === 'consulta' && busy;
          return <div key={i} className={'cerebro-action ' + a.status}>
            <div className="cerebro-action-head"><span aria-hidden>{ICON[a.type]}</span><strong>{a.title}</strong><em>{a.type === 'abrir' ? 'Abrir · ' + a.text : LABEL[a.type]}</em></div>
            {a.reason && <p>{a.reason}</p>}
            {a.text && a.type !== 'abrir' && <blockquote>{a.text}</blockquote>}
            {a.status === 'propuesta'
              ? <div className="cerebro-buttons"><button className="accept" disabled={wait || needsMain} title={needsMain ? 'Espera a que termine la petición de la ventana principal' : undefined} onClick={() => void decide(t, i, 'accept')}>{wait ? 'Ejecutando…' : 'Aceptar'}</button><button disabled={wait} onClick={() => void decide(t, i, 'reject')}>Descartar</button></div>
              : <small className="cerebro-status">{a.status === 'aceptada' ? '✓ Aceptada' : '✕ Descartada'}{a.outcome ? ' · ' + a.outcome : ''}</small>}
            {note[key] && a.status === 'propuesta' && <small className="cerebro-status error" role="status">{note[key]}</small>}
          </div>;
        })}
      </div>)}
      {thinking && <div className="cerebro-turn cb-assistant thinking" aria-label="Pensando">Pensando con el modelo local…</div>}
    </div>
    <form className="cerebro-input" onSubmit={e => {e.preventDefault(); void ask()}}>
      <textarea ref={field} rows={2} value={input} maxLength={4000} placeholder="Escribe cualquier consulta…" aria-label="Consulta al Cerebro" onChange={e => setInput(e.target.value)}
        onKeyDown={e => {if (e.key === 'Enter' && !e.shiftKey) {e.preventDefault(); void ask()}}} />
      <VoiceInput compact transcribe={pcm => post('voice', {pcm})} onRecording={setListening}
        onText={text => {if (text.trim()) void ask(text); else setTurns(t => [...t, {role: 'assistant', text: 'No te escuché; vuelve a intentarlo.', error: true}])}}
        onError={text => setTurns(t => [...t, {role: 'assistant', text, error: true}])} />
      <button type="submit" disabled={thinking || !input.trim()} aria-label="Enviar">↑</button>
    </form>
  </div>;
}
