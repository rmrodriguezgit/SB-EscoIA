import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

// Galaxia de EscoIA: cada petición o tarea es una estrella en el brazo de su tipo, el núcleo es el
// motor local (LLMLX) y los anillos interiores muestran la RAM y la ruta de la petición en curso.
// Datos: GET /api/galaxy (eventos, expedientes y métricas reales de LocalLLM.app). Solo lectura.

export type RequestEvent={id:number;task_id?:string;state:string;message:string;at:string};
type AcademicEvent={agent:string;state:string;message:string};
type Step={state:string;message:string;at:number|null};
type Run={id:string;title:string;kind:Kind;status:Status;mode:string;start:number|null;end:number|null;duration_s:number;used_llm:boolean;reviewed:boolean;sources:number;record:string;steps:Step[]};
type ModelUse={model:string;requests:number;ok:number;errors:number;rejected:number;avg_tokens_per_sec:number|null;completion_tokens:number|null;prompt_tokens:number|null;avg_ttft_ms:number|null};
type Call={time:string;model:string;status:number;client:string;endpoint:string;prompt_tokens:number|null;completion_tokens:number|null;tokens_per_sec:number|null;error:string|null};
type Llm={connected:boolean;reason?:string;window:string;engine?:string;default_model?:string;loaded?:string[];in_flight?:number;queued?:number;capacity?:number;breaker_open?:boolean;paused?:boolean;
 memory?:{available_gib:number;threshold_gib:number;total_gib:number;swap_gib:number;compressed_gib:number;pressure:string};
 totals?:Record<string,number|null>;by_model?:ModelUse[];recent?:Call[];incidents?:{kind:string;detail:string;time:string}[]};
type Snapshot={generated:number;busy:boolean;model:string;runs:Run[];llm:Llm};
type Kind='consulta'|'programa'|'leccion'|'investigacion'|'administracion'|'cola';
type Status='done'|'held'|'error'|'active'|'queued'|'confirm'|'cancelled'|'stale';

const KINDS:{id:Kind;label:string;color:string}[]=[
 {id:'consulta',label:'Consultas',color:'#60a5fa'},{id:'programa',label:'Programas',color:'#34d399'},{id:'leccion',label:'Lecciones',color:'#f472b6'},
 {id:'investigacion',label:'Investigación',color:'#a78bfa'},{id:'administracion',label:'Administración',color:'#fb923c'},{id:'cola',label:'Cola · MCP',color:'#22d3ee'}];
const STATUS:Record<Status,{label:string;color:string}>={
 done:{label:'Completada',color:'#5eead4'},held:{label:'Retenida',color:'#fbbf24'},error:{label:'Fallida',color:'#f87171'},active:{label:'En curso',color:'#ffffff'},
 queued:{label:'En cola',color:'#a5b4fc'},confirm:{label:'Por confirmar',color:'#e879f9'},cancelled:{label:'Cancelada',color:'#64748b'},stale:{label:'Interrumpida',color:'#94a3b8'}};
const C=500; // centro del lienzo 1000×1000

function rng(seed:number){return()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296}}
const STARFIELD=(()=>{const r=rng(7);return Array.from({length:220},()=>({x:r()*1000,y:r()*1000,s:r()*1.3+.2,o:r()*.6+.15,t:r()<.12}))})();
function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}
const polar=(r:number,a:number)=>({x:C+r*Math.cos(a),y:C+r*Math.sin(a)});
const fmt=(n:number|null|undefined,d=0)=>n===null||n===undefined||Number.isNaN(n)?'—':n.toLocaleString('es-MX',{maximumFractionDigits:d,minimumFractionDigits:d});
const ago=(t:number|null)=>{if(!t)return '—';const s=Date.now()/1000-t;return s<60?'hace '+Math.max(1,Math.round(s))+' s':s<3600?'hace '+Math.round(s/60)+' min':s<86400?'hace '+Math.round(s/3600)+' h':'hace '+Math.round(s/86400)+' d'};
const dur=(s:number)=>s<1?fmt(s*1000)+' ms':s<60?fmt(s,1)+' s':fmt(s/60,1)+' min';

/** Etapas canónicas de la ruta, como la vista anterior, para el anillo de la petición en curso. */
function stagesFor(run:Run|undefined,module?:string){
 const st=new Set((run?.steps||[]).map(s=>s.state));
 if(module)return ['Gateway','Permisos',module,'Resultado'];
 if(st.has('Cuantitativo'))return ['Gateway','Cuantitativo','Qwen','Laya','Integración','Resultado'];
 if(st.has('Investigación'))return ['Gateway','RAG','Investigación','Qwen','Laya','Didáctica',...(st.has('Notebook')?['Notebook']:[]),'Resultado'];
 if(st.has('Planeación')||st.has('Archivos'))return ['Gateway','RAG','Planeación','Archivos','Resultado'];
 if(st.has('Administración'))return ['Gateway','Administración','Resultado'];
 return ['Gateway','RAG','Qwen','Laya','Resultado'];
}
function stageState(stage:string,run:Run|undefined,stages:string[]){
 const seen=new Set((run?.steps||[]).map(s=>s.state));const last=[...stages].reverse().find(s=>seen.has(s));
 if(!run)return 'waiting';
 if(stage==='Resultado')return run.status==='done'?'done':['error','held','stale'].includes(run.status)?'error':run.status==='confirm'?'warning':'waiting';
 if(['error','held'].includes(run.status)&&stage===last)return 'error';
 if(run.status==='active'&&stage===last)return 'active';
 return seen.has(stage)?'done':'waiting';
}

function useGalaxy(fast:boolean){
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[window_,setWindow]=useState('24h');
 useEffect(()=>{let stop=false,timer=0;
  async function load(){
   if(document.visibilityState==='hidden'){timer=window.setTimeout(load,4000);return}
   try{const r=await fetch('/api/galaxy?window='+window_);const d=await r.json();if(!r.ok)throw Error(d.error);if(!stop){setData(d);setError('')}}
   catch(e){if(!stop)setError((e as Error).message)}
   if(!stop)timer=window.setTimeout(load,fast?2000:5000);
  }
  load();return()=>{stop=true;clearTimeout(timer)}},[fast,window_]);
 return {data,error,window:window_,setWindow};
}

function GalaxyMap({data,selected,onSelect,filter,compact,stageRun,stages,module,academic}:{data:Snapshot|null;selected?:string;onSelect:(id:string)=>void;filter:Set<Kind>;compact:boolean;stageRun?:Run;stages:string[];module?:string;academic:AcademicEvent|null}){
 const [hover,setHover]=useState<{run:Run;x:number;y:number}|null>(null);
 const runs=data?.runs||[];const llm=data?.llm;
 const placed=useMemo(()=>{
  const byKind:Record<string,Run[]>={};runs.forEach(r=>(byKind[r.kind]=byKind[r.kind]||[]).push(r));
  const out:{run:Run;x:number;y:number;size:number;opacity:number;color:string;arm:number}[]=[];
  KINDS.forEach((k,arm)=>{(byKind[k.id]||[]).forEach((run,n)=>{
   const base=arm*Math.PI/3-Math.PI/2;const r=150+n*Math.min(16,320/Math.max(1,(byKind[k.id]||[]).length))+hash(run.id)*10;
   const a=base+r*.0105+(hash(run.id+'a')-.5)*.16;const p=polar(Math.min(r,475),a);
   out.push({run,...p,arm,size:3.2+Math.min(8,Math.log2(1+run.duration_s)*1.5),opacity:Math.max(.35,1-n*.012),color:STATUS[run.status].color});
  })});return out},[runs]);
 const busy=Boolean(data?.busy)||(llm?.in_flight||0)>0||Boolean(module&&academic&&!['completed','completada','failed','fallida'].includes(academic.state));
 const coreColor=!llm?.connected?'#64748b':llm.breaker_open?'#f87171':busy?'#fde68a':'#5eead4';
 const mem=llm?.memory;const usedFrac=mem&&mem.total_gib?Math.min(1,(mem.total_gib-mem.available_gib)/mem.total_gib):0;
 const limitFrac=mem&&mem.total_gib?(mem.total_gib-mem.threshold_gib)/mem.total_gib:0;
 const arc=(r:number,f0:number,f1:number)=>{const a0=-Math.PI/2+f0*2*Math.PI,a1=-Math.PI/2+f1*2*Math.PI;const p0=polar(r,a0),p1=polar(r,a1);return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${f1-f0>.5?1:0} 1 ${p1.x} ${p1.y}`};
 const stageNodes=stages.map((s,i)=>{const a=-Math.PI/2-Math.PI*.82+i*(Math.PI*1.64)/Math.max(1,stages.length-1);return {s,...polar(124,a),a}});
 const sel=placed.find(p=>p.run.id===selected);
 const model=(llm?.loaded?.[0]||data?.model||'').replace(/^llmlx:/,'');
 return <div className="galaxy-map">
  <svg viewBox={compact?'110 110 780 780':'0 0 1000 1000'} role="img" aria-label={`Galaxia de peticiones: ${runs.length} peticiones; motor ${llm?.connected?(busy?'generando':'en reposo'):'sin conexión'}`}>
   <defs>
    <radialGradient id="gx-bg" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#1b2550"/><stop offset=".55" stopColor="#0b1226"/><stop offset="1" stopColor="#05070f"/></radialGradient>
    <radialGradient id="gx-core" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ffffff"/><stop offset=".35" stopColor={coreColor}/><stop offset="1" stopColor={coreColor} stopOpacity="0"/></radialGradient>
    <radialGradient id="gx-dust" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#7c8cff" stopOpacity=".22"/><stop offset=".6" stopColor="#3b4ba8" stopOpacity=".06"/><stop offset="1" stopColor="#000" stopOpacity="0"/></radialGradient>
    <filter id="gx-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    {KINDS.map(k=><linearGradient key={k.id} id={'gx-arm-'+k.id}><stop offset="0" stopColor={k.color} stopOpacity=".5"/><stop offset="1" stopColor={k.color} stopOpacity="0"/></linearGradient>)}
   </defs>
   <rect x="0" y="0" width="1000" height="1000" fill="url(#gx-bg)"/>
   {STARFIELD.map((s,i)=><circle key={i} className={s.t?'gx-twinkle':undefined} cx={s.x} cy={s.y} r={s.s} fill="#dbe4ff" opacity={s.o} style={s.t?{animationDelay:`${(i%9)*.7}s`}:undefined}/>)}
   <circle cx={C} cy={C} r="480" fill="url(#gx-dust)"/>
   <g className="gx-spin">
    {KINDS.map((k,arm)=>{const pts=Array.from({length:40},(_,i)=>{const r=140+i*8.5;return polar(r,arm*Math.PI/3-Math.PI/2+r*.0105)});
     const end=pts[pts.length-1];const count=runs.filter(r=>r.kind===k.id).length;const on=filter.has(k.id);
     return <g key={k.id} opacity={on?1:.15}>
      <path d={'M '+pts.map(p=>`${p.x} ${p.y}`).join(' L ')} fill="none" stroke={k.color} strokeOpacity=".16" strokeWidth="26" strokeLinecap="round"/>
      <path d={'M '+pts.map(p=>`${p.x} ${p.y}`).join(' L ')} fill="none" stroke={k.color} strokeOpacity=".35" strokeWidth="1.2" strokeDasharray="2 7"/>
      {!compact&&<text className="gx-arm-label" x={end.x} y={end.y} fill={k.color} textAnchor="middle">{k.label} · {count}</text>}
     </g>})}
    {sel&&<line x1={C} y1={C} x2={sel.x} y2={sel.y} className="gx-lane"/>}
    {placed.map(p=>{const on=filter.has(p.run.kind);const live=p.run.status==='active'||p.run.status==='queued';
     return <g key={p.run.id} className={'gx-star'+(live?' live':'')+(p.run.id===selected?' selected':'')} opacity={on?p.opacity:.08}
      onClick={()=>onSelect(p.run.id)} onMouseEnter={()=>setHover({run:p.run,x:p.x,y:p.y})} onMouseLeave={()=>setHover(null)}
      tabIndex={on?0:-1} role="button" aria-label={`${p.run.title} · ${STATUS[p.run.status].label}`} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(p.run.id)}}}>
      <circle cx={p.x} cy={p.y} r={p.size*2.6} fill={p.color} opacity=".14"/>
      <circle cx={p.x} cy={p.y} r={p.size} fill={p.color} filter="url(#gx-glow)"/>
      {p.run.used_llm&&<circle cx={p.x} cy={p.y} r={p.size+3.5} fill="none" stroke={KINDS[p.arm].color} strokeOpacity=".7" strokeWidth="1"/>}
      {p.run.id===selected&&<circle cx={p.x} cy={p.y} r={p.size+9} fill="none" stroke="#fff" strokeWidth="1.5" className="gx-select-ring"/>}
     </g>})}
   </g>
   {/* Anillo de RAM: usado frente al total; la marca es donde LLMLX pausa la generación. */}
   <circle cx={C} cy={C} r="92" fill="none" stroke="#1e2a4d" strokeWidth="7"/>
   {mem&&<path d={arc(92,0,Math.max(.001,usedFrac))} fill="none" stroke={usedFrac>limitFrac?'#f87171':usedFrac>limitFrac-.08?'#fbbf24':'#5eead4'} strokeWidth="7" strokeLinecap="round"/>}
   {mem&&(()=>{const p0=polar(84,-Math.PI/2+limitFrac*2*Math.PI),p1=polar(101,-Math.PI/2+limitFrac*2*Math.PI);return <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke="#f87171" strokeWidth="2.5"/>})()}
   {/* Ruta de la petición en curso o seleccionada. */}
   <circle cx={C} cy={C} r="124" fill="none" stroke="#2a3866" strokeWidth="1" strokeDasharray="3 5"/>
   {stageNodes.map((n,i)=>{const s=stageState(n.s,stageRun,stages);const color=s==='done'?'#5eead4':s==='active'?'#fde68a':s==='error'?'#f87171':s==='warning'?'#e879f9':'#334155';
    const label=polar(150,n.a);
    return <g key={n.s+i} className={'gx-stage '+s}><circle cx={n.x} cy={n.y} r="7.5" fill={color} stroke="#0b1226" strokeWidth="2"/>{s==='active'&&<circle cx={n.x} cy={n.y} r="13" fill="none" stroke={color} className="gx-ping"/>}
     {!compact&&<text x={label.x} y={label.y+4} textAnchor="middle" className="gx-stage-label">{n.s}</text>}</g>})}
   {/* Núcleo: motor local. */}
   <circle cx={C} cy={C} r="78" fill="url(#gx-core)" className={busy?'gx-core busy':'gx-core'}/>
   {busy&&<g className="gx-orbit"><circle cx={C+60} cy={C} r="4" fill="#fff" filter="url(#gx-glow)"/></g>}
   <text x={C} y={C-6} textAnchor="middle" className="gx-core-title">{llm?.connected?(busy?'Generando':'En reposo'):'LLMLX sin conexión'}</text>
   <text x={C} y={C+16} textAnchor="middle" className="gx-core-sub">{model||'—'}</text>
   {hover&&!compact&&<g pointerEvents="none"><rect x={Math.min(hover.x+14,700)} y={Math.min(hover.y-14,930)} width="290" height="56" rx="8" fill="#0b1226" stroke="#334a85"/>
    <text x={Math.min(hover.x+26,712)} y={Math.min(hover.y+6,950)} className="gx-tip-title">{hover.run.title.slice(0,40)}{hover.run.title.length>40?'…':''}</text>
    <text x={Math.min(hover.x+26,712)} y={Math.min(hover.y+26,970)} className="gx-tip-sub">{STATUS[hover.run.status].label} · {dur(hover.run.duration_s)} · {ago(hover.run.end)}</text></g>}
  </svg>
 </div>;
}

function Bar({value,max,color,label}:{value:number;max:number;color:string;label:string}){
 return <div className="gx-bar" title={label}><span style={{width:`${max?Math.max(2,value/max*100):0}%`,background:color}}/></div>;
}

function LlmPanel({llm,model,window,setWindow}:{llm?:Llm;model?:string;window:string;setWindow:(w:string)=>void}){
 if(!llm)return <div className="gx-card"><h3>Motor local</h3><p className="gx-muted">Midiendo…</p></div>;
 if(!llm.connected)return <div className="gx-card"><h3>Motor local · LLMLX</h3><p className="gx-alert">{llm.reason||'LLMLX no responde'}. Abre LocalLLM.app.</p></div>;
 const t=llm.totals||{};const mem=llm.memory;const recent=[...(llm.recent||[])].reverse();const maxTok=Math.max(1,...recent.map(r=>r.completion_tokens||0));
 const maxReq=Math.max(1,...(llm.by_model||[]).map(m=>m.requests));
 return <>
  <div className="gx-card">
   <h3><span className={'gx-dot '+(llm.breaker_open?'error':(llm.in_flight||0)>0?'busy':'ok')}/>Motor local · LLMLX</h3>
   <dl className="gx-kv">
    <dt>Estado</dt><dd>{llm.breaker_open?'Pausado por poca RAM':(llm.in_flight||0)>0?`Generando · ${llm.in_flight}/${llm.capacity}`:'En reposo'}{llm.queued?` · ${llm.queued} en cola`:''}</dd>
    <dt>Modelo elegido</dt><dd>{(model||'').replace(/^llmlx:/,'')||'—'}</dd>
    <dt>En memoria</dt><dd>{llm.loaded?.length?llm.loaded.join(', '):'Ninguno (se descarga tras cada respuesta)'}</dd>
    <dt>Motor</dt><dd>{llm.engine}</dd>
   </dl>
   {mem&&<div className="gx-ram">
    <div className="gx-ram-head"><span>RAM libre <b>{fmt(mem.available_gib,2)} GiB</b> de {fmt(mem.total_gib,0)}</span><span>pausa &lt; {fmt(mem.threshold_gib,1)} GiB</span></div>
    <div className="gx-ram-bar"><span style={{width:`${Math.min(100,(mem.total_gib-mem.available_gib)/mem.total_gib*100)}%`}}/><i style={{left:`${(mem.total_gib-mem.threshold_gib)/mem.total_gib*100}%`}}/></div>
    <small>Presión {mem.pressure||'—'} · swap {fmt(mem.swap_gib,2)} GiB · comprimida {fmt(mem.compressed_gib,2)} GiB</small>
   </div>}
  </div>
  <div className="gx-card">
   <div className="gx-card-head"><h3>Uso del LLM</h3><div className="gx-tabs" role="tablist">{['1h','24h','7d'].map(w=><button key={w} role="tab" aria-selected={window===w} className={window===w?'on':''} onClick={()=>setWindow(w)}>{w}</button>)}</div></div>
   <div className="gx-metrics">
    <div><b>{fmt(t.requests)}</b><span>llamadas</span></div>
    <div><b>{fmt(t.total_tokens)}</b><span>tokens · {fmt(t.completion_tokens)} generados</span></div>
    <div><b>{fmt(t.tokens_per_sec_p50,1)}</b><span>tok/s mediana · p95 {fmt(t.tokens_per_sec_p95,1)}</span></div>
    <div><b>{t.ttft_ms_p50!=null?fmt((t.ttft_ms_p50 as number)/1000,1)+' s':'—'}</b><span>primer token · p95 {t.ttft_ms_p95!=null?fmt((t.ttft_ms_p95 as number)/1000,1)+' s':'—'}</span></div>
   </div>
   <div className="gx-outcomes"><span className="ok">✓ {fmt(t.ok)} correctas</span><span className="err">✕ {fmt(t.errors)} errores</span><span className="rej">⏸ {fmt(t.rejected)} rechazadas por RAM</span></div>
   {(llm.by_model||[]).map(m=><div key={m.model} className="gx-model"><div><b>{m.model}</b><span>{m.requests} llamadas · {fmt(m.avg_tokens_per_sec,1)} tok/s</span></div><Bar value={m.requests} max={maxReq} color="#60a5fa" label={`${m.requests} llamadas`}/></div>)}
  </div>
  <div className="gx-card">
   <h3>Llamadas recientes al modelo</h3>
   {recent.length?<div className="gx-spark" role="img" aria-label={`${recent.length} llamadas recientes`}>{recent.map((r,i)=><span key={i} title={`${r.time} · ${r.model} · ${r.status===200?(r.completion_tokens??'—')+' tokens'+(r.tokens_per_sec?' · '+r.tokens_per_sec+' tok/s':''):'HTTP '+r.status+(r.error?' · '+r.error:'')}`}
     style={{height:`${r.status===200?Math.max(10,(r.completion_tokens||0)/maxTok*100):14}%`,background:r.status===200?'#5eead4':r.status===429?'#fbbf24':'#f87171'}}/>)}</div>:<p className="gx-muted">Sin llamadas en esta ventana.</p>}
   <div className="gx-legend-row"><span><i style={{background:'#5eead4'}}/>tokens generados</span><span><i style={{background:'#fbbf24'}}/>pausa por RAM</span><span><i style={{background:'#f87171'}}/>error</span></div>
   {llm.incidents?.length?<details className="gx-incidents"><summary>Incidentes de memoria ({llm.incidents.length})</summary><ul>{llm.incidents.map((x,i)=><li key={i}><time>{x.time}</time> {x.kind}</li>)}</ul></details>:null}
  </div>
 </>;
}

function RunDetail({run}:{run?:Run}){
 if(!run)return <div className="gx-card"><h3>Petición</h3><p className="gx-muted">Selecciona una estrella para ver su recorrido.</p></div>;
 const t0=run.steps[0]?.at||run.start||0;const kind=KINDS.find(k=>k.id===run.kind);
 return <div className="gx-card gx-detail">
  <h3>{run.title||'Petición'}</h3>
  <div className="gx-chips"><span style={{borderColor:kind?.color,color:kind?.color}}>{kind?.label}</span><span style={{borderColor:STATUS[run.status].color,color:STATUS[run.status].color}}>{STATUS[run.status].label}</span>{run.used_llm&&<span>Qwen</span>}{run.reviewed&&<span>LAYA</span>}</div>
  <dl className="gx-kv"><dt>Duración</dt><dd>{dur(run.duration_s)} · {ago(run.end)}</dd>{run.mode&&<><dt>Modo</dt><dd>{run.mode}</dd></>}<dt>Fuentes</dt><dd>{run.sources}</dd>{run.record&&<><dt>Expediente</dt><dd>{run.record}</dd></>}</dl>
  <ol className="gx-timeline">{run.steps.map((s,i)=><li key={i} className={STATUS[run.status]&&i===run.steps.length-1?'last':''}><time>+{fmt(Math.max(0,(s.at||t0)-t0),1)} s</time><b>{s.state}</b><span>{s.message}</span></li>)}</ol>
 </div>;
}

export function Galaxy({events,busy,module,academic}:{events:RequestEvent[];busy:boolean;module?:string;academic:AcademicEvent|null}){
 const [expanded,setExpanded]=useState(false),[collapsed,setCollapsed]=useState(false),[floating,setFloating]=useState(true);
 const [selected,setSelected]=useState<string>();const [filter,setFilter]=useState<Set<Kind>>(()=>new Set(KINDS.map(k=>k.id)));
 const [position,setPosition]=useState(()=>({x:Math.max(8,window.innerWidth-444),y:90}));const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const {data,error,window:win,setWindow}=useGalaxy(busy||expanded);
 function clamp(x:number,y:number){return {x:Math.max(8,Math.min(x,window.innerWidth-Math.min(420,window.innerWidth-16)-8)),y:Math.max(8,Math.min(y,window.innerHeight-(collapsed?120:Math.min(520,window.innerHeight-16))))}}
 useEffect(()=>{try{const s=JSON.parse(localStorage.getItem('escoia.galaxy')||'null');if(s){setFloating(Boolean(s.floating));setPosition(clamp(Number(s.x)||24,Number(s.y)||90));setCollapsed(Boolean(s.collapsed))}}catch{/* sin almacenamiento */}},[]);
 useEffect(()=>{try{localStorage.setItem('escoia.galaxy',JSON.stringify({...position,floating,collapsed}))}catch{/* sin almacenamiento */}},[position,floating,collapsed]);
 useEffect(()=>{const f=()=>setPosition(p=>clamp(p.x,p.y));window.addEventListener('resize',f);return()=>window.removeEventListener('resize',f)},[]);
 useEffect(()=>{if(!expanded)return;const f=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false)};window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f)},[expanded]);
 // La petición en vivo: la más reciente de los eventos del estado (se actualizan más rápido que /api/galaxy).
 const liveId=events[0]?.task_id;const runs=data?.runs||[];
 const liveRun=useMemo(()=>{const base=runs.find(r=>r.id===liveId);if(!liveId)return base;const ev=events.filter(e=>e.task_id===liveId).slice().reverse();
  if(!ev.length)return base;const last=ev[ev.length-1].state;const map:Record<string,Status>={completada:'done',fallida:'error',bloqueada:'error',retenida:'held',cancelada:'cancelled'};
  return {...(base||{id:liveId,title:ev[0].message,kind:'consulta' as Kind,mode:'',start:null,end:null,duration_s:0,used_llm:false,reviewed:false,sources:0,record:''}),status:busy&&!map[last]?'active':(map[last]||base?.status||'active'),steps:ev.map(e=>({state:e.state,message:e.message,at:Date.parse(e.at)/1000}))} as Run},[runs,events,liveId,busy]);
 const selectedRun=runs.find(r=>r.id===selected)||(selected===liveRun?.id?liveRun:undefined);
 const stageRun=(busy||!selectedRun)?liveRun:selectedRun;const stages=stagesFor(stageRun,module);
 const counts=useMemo(()=>{const c:Partial<Record<Status,number>>={};runs.forEach(r=>c[r.status]=(c[r.status]||0)+1);return c},[runs]);
 const llm=data?.llm;const generating=busy||(llm?.in_flight||0)>0;
 const description=module?academic?.message:(stageRun?.steps.at(-1)?.message||'');
 const headline=!llm?'Conectando…':!llm.connected?'LLMLX sin conexión':llm.breaker_open?'Motor en pausa por RAM':generating?'Generando respuesta':'En reposo';
 const toggle=(k:Kind)=>setFilter(f=>{const n=new Set(f);if(n.has(k)&&n.size>1)n.delete(k);else n.add(k);return n});
 const map=(compact:boolean)=><GalaxyMap data={data} selected={selected} onSelect={id=>{setSelected(id);if(compact)setExpanded(true)}} filter={filter} compact={compact} stageRun={stageRun} stages={stages} module={module} academic={academic}/>;

 return <>
  <section className={'galaxy-panel'+(floating?' floating':'')} style={floating?{left:position.x,top:position.y}:undefined} aria-label="Galaxia de peticiones y motor local">
   <div className="gx-head">
    {floating&&<button className="gx-drag" aria-label="Mover la galaxia; arrastra o usa las flechas" onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,px:position.x,py:position.y};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.px+e.clientX-drag.current.x,drag.current.py+e.clientY-drag.current.y))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{const d:Record<string,number[]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(d[e.key]){e.preventDefault();setPosition(p=>clamp(p.x+d[e.key][0],p.y+d[e.key][1]))}}}>⠿</button>}
    <div className="gx-title"><span>GALAXIA EN VIVO</span><b>{headline}</b></div>
    <div className="gx-actions">
     <button onClick={()=>setExpanded(true)} title="Abrir la galaxia completa">⤢ Explorar</button>
     <button onClick={()=>setFloating(!floating)} title={floating?'Anclar en la página':'Panel flotante'}>{floating?'↙':'↗'}</button>
     <button aria-label={collapsed?'Expandir':'Minimizar'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'+':'−'}</button>
    </div>
   </div>
   {!collapsed&&<>
    {map(true)}
    <div className="gx-mini">
     <span><b>{fmt(runs.length)}</b> peticiones</span>
     <span><b>{fmt(llm?.totals?.tokens_per_sec_p50,1)}</b> tok/s</span>
     <span><b>{llm?.memory?fmt(llm.memory.available_gib,1):'—'}</b> GiB libres</span>
     {counts.held||counts.error?<span className="warn"><b>{(counts.held||0)+(counts.error||0)}</b> requieren atención</span>:null}
    </div>
   </>}
   <p className="gx-desc" aria-live="polite">{error?'Galaxia sin datos: '+error:description||'Escribe o dicta una solicitud para verla recorrer la galaxia.'}</p>
  </section>
  {expanded&&createPortal(<div className="gx-overlay" role="dialog" aria-modal="true" aria-label="Galaxia de EscoIA">
   <header className="gx-overlay-head">
    <div className="gx-title"><span>GALAXIA DE ESCOIA</span><b>Peticiones, trabajo y motor local</b></div>
    <div className="gx-filters">{KINDS.map(k=><button key={k.id} className={filter.has(k.id)?'on':''} style={{'--k':k.color} as React.CSSProperties} onClick={()=>toggle(k.id)} aria-pressed={filter.has(k.id)}>{k.label} <small>{runs.filter(r=>r.kind===k.id).length}</small></button>)}</div>
    <button className="gx-close" onClick={()=>setExpanded(false)} aria-label="Cerrar la galaxia">✕</button>
   </header>
   <div className="gx-overlay-body">
    <div className="gx-stage-col">
     {map(false)}
     <div className="gx-status-legend">{(Object.keys(STATUS) as Status[]).filter(s=>counts[s]).map(s=><span key={s}><i style={{background:STATUS[s].color}}/>{STATUS[s].label} <b>{counts[s]}</b></span>)}<span><i className="ring"/>usó Qwen</span><span className="gx-muted">Anillo interior: RAM usada · marca roja = pausa de LLMLX</span></div>
    </div>
    <div className="gx-side">
     <LlmPanel llm={llm} model={data?.model} window={win} setWindow={setWindow}/>
     <RunDetail run={selectedRun||liveRun}/>
     <div className="gx-card"><h3>Últimas peticiones</h3><ul className="gx-list">{runs.slice(0,10).map(r=><li key={r.id}><button className={r.id===selected?'on':''} onClick={()=>setSelected(r.id)}><i style={{background:STATUS[r.status].color}}/><span>{r.title||r.mode||r.id}</span><small>{ago(r.end)}</small></button></li>)}</ul></div>
    </div>
   </div>
  </div>,document.body)}
 </>;
}
