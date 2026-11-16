import { openExplorer } from './explorer';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

// Cuerdas de EscoIA (metáfora de teoría de cuerdas): cada petición es una cuerda abierta que vibra
// sobre la D-brana de su tipo de trabajo (las tareas de cola/MCP son cuerdas cerradas); el modo de
// vibración es el número de etapas, el color el estado y la longitud la duración. Arriba, la cuerda
// fundamental del motor LLMLX vibra con los tok/s reales y su tensión es la RAM; abajo, la ruta de la
// petición es una onda estacionaria con un nodo por etapa.
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

function hash(s:string){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}
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

type Hit={id:string;x0:number;x1:number;y0:number;y1:number};
type Scene={data:Snapshot|null;selected?:string;filter:Set<Kind>;compact:boolean;stageRun?:Run;stages:string[];busy:boolean;reduced:boolean};
const ENGINE_COLOR={idle:'#5eead4',busy:'#fde68a',breaker:'#f87171',off:'#64748b'};
const STAGE_COLOR:Record<string,string>={done:'#5eead4',active:'#fde68a',error:'#f87171',warning:'#e879f9',waiting:'#334155'};

/** Dibuja un fotograma: cuerda fundamental (motor), D-branas con cuerdas abiertas/cerradas y la onda estacionaria de la ruta. */
function drawScene(ctx:CanvasRenderingContext2D,W:number,H:number,t:number,s:Scene,hits:Hit[]){
 const {data,selected,filter,compact,stageRun,stages}=s;const runs=data?.runs||[];const llm=data?.llm;
 hits.length=0;
 const pad=compact?8:14,L=compact?0:132,x0=L+pad,x1=W-pad,Wp=x1-x0;
 const engineH=compact?34:70,routeH=compact?40:104,gap=compact?4:10;
 const braneTop=pad+engineH+gap,braneBottom=H-pad-routeH-gap,bandH=(braneBottom-braneTop)/KINDS.length;
 // Fondo: retícula de espacio-tiempo.
 const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,'#0a1024');bg.addColorStop(1,'#04060e');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
 ctx.strokeStyle='rgba(120,140,220,.06)';ctx.lineWidth=1;
 for(let x=x0;x<=x1;x+=compact?28:42){ctx.beginPath();ctx.moveTo(x,braneTop);ctx.lineTo(x,braneBottom);ctx.stroke()}
 const text=(str:string,x:number,y:number,color:string,size=11,weight=600,align:CanvasTextAlign='left')=>{ctx.font=`${weight} ${size}px system-ui,-apple-system,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(str,x,y)};
 // ── Cuerda fundamental: motor LLMLX ──
 const generating=s.busy||(llm?.in_flight||0)>0;
 const state=!llm?.connected?'off':llm.breaker_open?'breaker':generating?'busy':'idle';
 const tps=Number(llm?.totals?.tokens_per_sec_p50)||12;
 const ey=pad+(compact?engineH*.42:engineH*.4);const eA=state==='busy'?engineH*.3:state==='idle'?1.6:state==='breaker'?.6:0;
 const ew=state==='busy'?2+tps/6:.9;
 ctx.save();ctx.shadowColor=ENGINE_COLOR[state];ctx.shadowBlur=state==='busy'?18:8;
 for(let layer=0;layer<3;layer++){
  ctx.beginPath();ctx.strokeStyle=ENGINE_COLOR[state];ctx.globalAlpha=layer===0?1:.28;ctx.lineWidth=layer===0?2.4:1;
  for(let i=0;i<=120;i++){const u=i/120,x=x0+u*Wp;const n=3+layer;const y=ey+eA*Math.sin(n*Math.PI*u)*Math.cos(ew*t+layer*1.7)+(layer?eA*.4*Math.sin((n+2)*Math.PI*u)*Math.sin(ew*1.3*t):0);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}
  ctx.stroke()}
 ctx.restore();ctx.globalAlpha=1;
 for(const xe of [x0,x1]){ctx.fillStyle=ENGINE_COLOR[state];ctx.beginPath();ctx.arc(xe,ey,3.5,0,Math.PI*2);ctx.fill()}
 // Tensión: RAM usada frente al total; la marca roja es la pausa de LLMLX.
 const mem=llm?.memory;const ry=pad+engineH-(compact?5:12);
 ctx.fillStyle='#1b2547';ctx.fillRect(x0,ry,Wp,3);
 if(mem&&mem.total_gib){const used=Math.min(1,(mem.total_gib-mem.available_gib)/mem.total_gib),limit=(mem.total_gib-mem.threshold_gib)/mem.total_gib;
  const g=ctx.createLinearGradient(x0,0,x1,0);g.addColorStop(0,'#5eead4');g.addColorStop(.7,'#60a5fa');g.addColorStop(1,'#fbbf24');ctx.fillStyle=used>limit?'#f87171':g;ctx.fillRect(x0,ry,Wp*used,3);
  ctx.fillStyle='#f87171';ctx.fillRect(x0+Wp*limit-1,ry-4,2,11);
  if(!compact)text(`RAM libre ${fmt(mem.available_gib,2)} GiB · pausa < ${fmt(mem.threshold_gib,1)} GiB`,x1,ry-6,'#8b9bc7',10.5,500,'right')}
 const model=(llm?.loaded?.[0]||data?.model||'').replace(/^llmlx:/,'');
 const engineLabel=state==='off'?'LLMLX sin conexión':state==='breaker'?'En pausa por RAM':state==='busy'?`Generando · ${fmt(tps,1)} tok/s`:'En reposo';
 if(compact)text(engineLabel+(model?' · '+model:''),x0+2,pad+9,'#b9c6ef',10,600);
 else{text('MOTOR LLMLX',pad,ey-6,'#7dd3fc',9.5,700);text(engineLabel,pad,ey+9,'#e6ecff',12,650);text(model||'—',pad,ey+24,'#8b9bc7',10.5,500)}
 // ── D-branas: una por tipo de trabajo ──
 const byKind:Record<string,Run[]>={};runs.forEach(r=>(byKind[r.kind]=byKind[r.kind]||[]).push(r));
 let selectedCenter:{x:number;y:number;run:Run}|null=null;
 KINDS.forEach((k,i)=>{
  const on=filter.has(k.id);const yB=braneTop+bandH*(i+.82);const list=byKind[k.id]||[];
  ctx.globalAlpha=on?1:.18;
  const band=ctx.createLinearGradient(0,yB-bandH*.8,0,yB);band.addColorStop(0,'rgba(0,0,0,0)');band.addColorStop(1,k.color+'1f');ctx.fillStyle=band;ctx.fillRect(x0,yB-bandH*.8,Wp,bandH*.8);
  ctx.strokeStyle=k.color;ctx.lineWidth=1.2;ctx.globalAlpha=(on?1:.18)*.75;ctx.beginPath();ctx.moveTo(x0,yB);ctx.lineTo(x1,yB);ctx.stroke();ctx.globalAlpha=on?1:.18;
  if(!compact){text(k.label,pad,yB-bandH*.38,k.color,11.5,650);text(`${list.length} · D-brana`,pad,yB-bandH*.38+14,'#8b9bc7',10,500)}
  const N=list.length;
  list.forEach((run,rank)=>{
   const h=hash(run.id),status=run.status,color=STATUS[status].color;
   const slot=N>1?Wp/N:Wp;const len=Math.min(Wp*.3,Math.max(compact?8:12,slot*3.2),(compact?10:16)+(compact?22:44)*Math.min(1,Math.log2(1+run.duration_s)/5));
   const xs=x1-len-(N>1?rank*(Wp-len)/(N-1):0);const xe=xs+len;
   const live=status==='active'||status==='queued';
   const n=Math.max(1,Math.min(7,run.steps.length));
   const arch=bandH*(.18+.22*Math.min(1,run.sources/6));
   const amp=bandH*.16*(live?1.6:status==='done'?.55:status==='held'||status==='confirm'?.4:.22);
   const w=live?8:(1+h*.8);const ph=h*Math.PI*2;
   const isSel=run.id===selected;const alpha=on?(isSel?1:Math.max(.28,1-rank*.012)):.07;
   const T=s.reduced?0:t;
   ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=isSel?2.6:live?2:1.15;
   ctx.shadowColor=color;ctx.shadowBlur=isSel||live?14:0;
   if(k.id==='cola'){ // cuerda cerrada
    const cx=xs+len/2,cy=yB-bandH*.42,r=Math.max(5,len/3.2);ctx.beginPath();
    for(let j=0;j<=64;j++){const th=j/64*Math.PI*2;const rr=r*(1+.2*Math.sin(n*th+w*T+ph));const x=cx+rr*Math.cos(th),y=cy+rr*.62*Math.sin(th);j?ctx.lineTo(x,y):ctx.moveTo(x,y)}
    ctx.stroke();hits.push({id:run.id,x0:cx-r-3,x1:cx+r+3,y0:cy-r,y1:cy+r});if(isSel)selectedCenter={x:cx,y:cy,run};
   }else{
    const seg=(a:number,b:number)=>{ctx.beginPath();for(let j=0;j<=28;j++){const u=a+(b-a)*j/28;const x=xs+u*len;const y=yB-arch*Math.sin(Math.PI*u)+amp*Math.sin(n*Math.PI*u)*Math.cos(w*T+ph);j?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke()};
    if(status==='error'||status==='stale'){seg(0,.42);seg(.58,1)}else seg(0,1);
    if(status==='queued'){ctx.setLineDash([3,3]);seg(0,1);ctx.setLineDash([])}
    ctx.shadowBlur=0;ctx.fillStyle=color;
    for(const xe2 of [xs,xe]){ctx.beginPath();ctx.arc(xe2,yB,isSel?3:1.8,0,Math.PI*2);ctx.fill()}
    if(status==='confirm'){ctx.globalAlpha=alpha*(.5+.5*Math.sin(T*4));ctx.beginPath();ctx.arc(xs+len/2,yB-arch,4,0,Math.PI*2);ctx.fill()}
    hits.push({id:run.id,x0:xs-2,x1:xe+2,y0:yB-arch-amp-4,y1:yB+4});if(isSel)selectedCenter={x:xs+len/2,y:yB-arch,run};
   }
   ctx.shadowBlur=0;
  });
  ctx.globalAlpha=1;
 });
 // Hoja de mundo: la cuerda seleccionada se une al motor si usó Qwen.
 if(selectedCenter){const c=selectedCenter as {x:number;y:number;run:Run};ctx.save();ctx.setLineDash([4,6]);ctx.strokeStyle=c.run.used_llm?'rgba(253,230,138,.55)':'rgba(255,255,255,.3)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(c.x,ey);ctx.stroke();ctx.restore();
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(c.x,c.y,8+2*Math.sin(t*3),0,Math.PI*2);ctx.stroke()}
 // ── Onda estacionaria: ruta de la petición en curso o seleccionada ──
 const ry2=H-pad-routeH*(compact?.42:.5);const inset=compact?6:34;const nodes=stages.map((st,i)=>({st,x:x0+inset+(stages.length>1?i*(Wp-2*inset)/(stages.length-1):(Wp-2*inset)/2),state:stageState(st,stageRun,stages)}));
 ctx.fillStyle='rgba(20,30,64,.55)';ctx.fillRect(x0-6,H-pad-routeH,Wp+12,routeH);
 for(let i=0;i<nodes.length-1;i++){
  const a=nodes[i],b=nodes[i+1];const st=b.state==='waiting'?'waiting':b.state;const A=(st==='active'?routeH*.28:st==='waiting'?0:st==='error'?routeH*.06:routeH*.12)*(compact?.8:1);
  const sw=st==='active'?7:1.4;ctx.strokeStyle=STAGE_COLOR[st];ctx.lineWidth=st==='waiting'?1:2;ctx.shadowColor=STAGE_COLOR[st];ctx.shadowBlur=st==='active'?16:st==='waiting'?0:6;
  if(st==='waiting')ctx.setLineDash([3,5]);
  ctx.beginPath();for(let j=0;j<=40;j++){const u=j/40;const x=a.x+u*(b.x-a.x);const y=ry2+A*Math.sin(Math.PI*u)*Math.cos(sw*(s.reduced?0:t)+i);j?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.setLineDash([]);ctx.shadowBlur=0;
 }
 nodes.forEach(nd=>{ctx.fillStyle=STAGE_COLOR[nd.state];ctx.beginPath();ctx.arc(nd.x,ry2,compact?3.5:6,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#04060e';ctx.lineWidth=2;ctx.stroke();
  if(!compact)text(nd.st,nd.x,ry2+24,nd.state==='waiting'?'#64748b':'#b9c6ef',10.5,600,'center')});
 if(!compact){text('RUTA DE LA PETICIÓN',pad,ry2-8,'#7dd3fc',9.5,700);text('onda estacionaria',pad,ry2+7,'#8b9bc7',10,500);
  const title=stageRun?.title||'Sin petición seleccionada';text(title.length>90?title.slice(0,89)+'…':title,x0,H-pad-routeH+16,'#e6ecff',11.5,600)}
}

function StringsMap({data,selected,onSelect,filter,compact,stageRun,stages,busy,paused}:{data:Snapshot|null;selected?:string;onSelect:(id:string)=>void;filter:Set<Kind>;compact:boolean;stageRun?:Run;stages:string[];busy:boolean;paused?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),box=useRef<HTMLDivElement>(null),hits=useRef<Hit[]>([]);
 const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const scene=useRef<Scene>({data,selected,filter,compact,stageRun,stages,busy,reduced});
 scene.current={data,selected,filter,compact,stageRun,stages,busy,reduced};
 const [hover,setHover]=useState<{run:Run;x:number;y:number}|null>(null);
 const drawNow=useRef<()=>void>(()=>{});
 useEffect(()=>{
  const c=canvas.current,b=box.current;if(!c||!b)return;let raf=0,last=0,size={w:0,h:0};
  const paint=(now:number)=>{const ctx=c.getContext('2d');if(ctx&&size.w>0)drawScene(ctx,size.w,size.h,now/1000,scene.current,hits.current)};
  // Al cambiar el tamaño el lienzo se borra: se repinta en el acto, sin esperar al siguiente fotograma.
  const fit=()=>{const r=b.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);size={w:r.width,h:r.height};c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);c.getContext('2d')?.setTransform(dpr,0,0,dpr,0,0);paint(performance.now())};
  drawNow.current=()=>paint(performance.now());
  const ro=new ResizeObserver(fit);ro.observe(b);fit();
  const loop=(now:number)=>{raf=requestAnimationFrame(loop);
   if(paused||document.hidden)return;const fps=scene.current.reduced?2:30;if(now-last<1000/fps)return;last=now;paint(now)};
  raf=requestAnimationFrame(loop);return()=>{cancelAnimationFrame(raf);ro.disconnect();drawNow.current=()=>{}}},[paused]);
 // Datos nuevos o selección: repintado inmediato (también con movimiento reducido o pestaña ralentizada).
 useEffect(()=>{drawNow.current()},[data,selected,filter,stageRun,stages,busy]);
 const pick=(e:React.MouseEvent)=>{const r=e.currentTarget.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
  const found=hits.current.filter(h=>x>=h.x0&&x<=h.x1&&y>=h.y0&&y<=h.y1&&filter.has((data?.runs.find(q=>q.id===h.id)?.kind||'consulta') as Kind));
  const best=found.sort((a,b)=>(a.x1-a.x0)-(b.x1-b.x0))[0];return {run:best?data?.runs.find(q=>q.id===best.id):undefined,x,y}};
 const runs=data?.runs||[];
 return <div className="strings-map" ref={box}>
  <canvas ref={canvas} role="img" aria-label={`Diagrama de cuerdas: ${runs.length} peticiones en ${KINDS.length} D-branas; motor ${data?.llm?.connected?(busy?'generando':'en reposo'):'sin conexión'}. La lista de peticiones permite seleccionarlas con el teclado.`}
   onMouseMove={e=>{const p=pick(e);setHover(p.run?{run:p.run,x:p.x,y:p.y}:null);e.currentTarget.style.cursor=p.run?'pointer':'default'}}
   onMouseLeave={()=>setHover(null)} onClick={e=>{const p=pick(e);if(p.run)onSelect(p.run.id)}}/>
  {hover&&<div className="cs-tip" style={{left:Math.min(hover.x+14,(box.current?.clientWidth||400)-260),top:Math.max(4,hover.y-56)}}>
   <b>{hover.run.title||hover.run.mode||'Petición'}</b>
   <span><i style={{background:STATUS[hover.run.status].color}}/>{STATUS[hover.run.status].label} · {dur(hover.run.duration_s)} · {ago(hover.run.end)}</span>
   <span>Modo {Math.max(1,Math.min(7,hover.run.steps.length))} · {hover.run.sources} fuentes{hover.run.used_llm?' · usó Qwen':''}</span>
  </div>}
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
 if(!run)return <div className="gx-card"><h3>Petición</h3><p className="gx-muted">Selecciona una cuerda para ver su recorrido.</p></div>;
 const t0=run.steps[0]?.at||run.start||0;const kind=KINDS.find(k=>k.id===run.kind);
 return <div className="gx-card gx-detail">
  <h3>{run.title||'Petición'}</h3>
  <div className="gx-chips"><span style={{borderColor:kind?.color,color:kind?.color}}>{kind?.label}</span><span style={{borderColor:STATUS[run.status].color,color:STATUS[run.status].color}}>{STATUS[run.status].label}</span>{run.used_llm&&<span>Qwen</span>}{run.reviewed&&<span>LAYA</span>}</div>
  <dl className="gx-kv"><dt>Duración</dt><dd>{dur(run.duration_s)} · {ago(run.end)}</dd>{run.mode&&<><dt>Modo</dt><dd>{run.mode}</dd></>}<dt>Fuentes</dt><dd>{run.sources}</dd>{run.record&&<><dt>Expediente</dt><dd>{run.record}</dd></>}</dl>
  <ol className="gx-timeline">{run.steps.map((s,i)=><li key={i} className={STATUS[run.status]&&i===run.steps.length-1?'last':''}><time>+{fmt(Math.max(0,(s.at||t0)-t0),1)} s</time><b>{s.state}</b><span>{s.message}</span></li>)}</ol>
 </div>;
}

export function Cuerdas({events,busy,module,academic,standalone=false}:{events:RequestEvent[];busy:boolean;module?:string;academic:AcademicEvent|null;standalone?:boolean}){
 const [expanded,setExpanded]=useState(standalone),[collapsed,setCollapsed]=useState(false),[floating,setFloating]=useState(true);
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
 const map=(compact:boolean)=><StringsMap data={data} selected={selected} onSelect={id=>{setSelected(id);if(compact)explore()}} filter={filter} compact={compact} stageRun={stageRun} stages={stages} busy={generating} paused={compact&&expanded}/>;

 // «Explorar» abre una ventana independiente (Electron por IPC o window.open); si se bloquea, el diagrama se expande aquí.
 function explore(){if(!openExplorer('cuerdas'))setExpanded(true)}
 const overlay=<>
   <header className="gx-overlay-head">
    <div className="gx-title"><span>TEORÍA DE CUERDAS · ESCOIA</span><b>Peticiones, trabajo y motor local</b></div>
    <div className="gx-filters">{KINDS.map(k=><button key={k.id} className={filter.has(k.id)?'on':''} style={{'--k':k.color} as React.CSSProperties} onClick={()=>toggle(k.id)} aria-pressed={filter.has(k.id)}>{k.label} <small>{runs.filter(r=>r.kind===k.id).length}</small></button>)}</div>
    {!standalone&&<button className="gx-close" onClick={()=>setExpanded(false)} aria-label="Cerrar el diagrama de cuerdas">✕</button>}
   </header>
   <div className="gx-overlay-body">
    <div className="gx-stage-col">
     {map(false)}
     <div className="gx-status-legend">{(Object.keys(STATUS) as Status[]).filter(s=>counts[s]).map(s=><span key={s}><i style={{background:STATUS[s].color}}/>{STATUS[s].label} <b>{counts[s]}</b></span>)}<span className="gx-muted">Cuerda abierta = petición · bucle = tarea de cola/MCP · modo = etapas · cuerda rota = fallida · arriba: motor LLMLX y tensión de RAM (marca roja = pausa)</span></div>
    </div>
    <div className="gx-side">
     <LlmPanel llm={llm} model={data?.model} window={win} setWindow={setWindow}/>
     <RunDetail run={selectedRun||liveRun}/>
     <div className="gx-card"><h3>Últimas peticiones</h3><ul className="gx-list">{runs.slice(0,10).map(r=><li key={r.id}><button className={r.id===selected?'on':''} onClick={()=>setSelected(r.id)}><i style={{background:STATUS[r.status].color}}/><span>{r.title||r.mode||r.id}</span><small>{ago(r.end)}</small></button></li>)}</ul></div>
    </div>
   </div>
  </>;
 if(standalone)return <div className="gx-overlay gx-window" aria-label="Cuerdas de EscoIA">{overlay}</div>;
 return <>
  <section className={'galaxy-panel'+(floating?' floating':'')} style={floating?{left:position.x,top:position.y}:undefined} aria-label="Cuerdas: peticiones y motor local">
   <div className="gx-head">
    {floating&&<button className="gx-drag" aria-label="Mover el panel de cuerdas; arrastra o usa las flechas" onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,px:position.x,py:position.y};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.px+e.clientX-drag.current.x,drag.current.py+e.clientY-drag.current.y))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{const d:Record<string,number[]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(d[e.key]){e.preventDefault();setPosition(p=>clamp(p.x+d[e.key][0],p.y+d[e.key][1]))}}}>⠿</button>}
    <div className="gx-title"><span>CUERDAS EN VIVO</span><b>{headline}</b></div>
    <div className="gx-actions">
     <button onClick={explore} title="Abrir el diagrama de cuerdas en una ventana independiente">⤢ Explorar</button>
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
   <p className="gx-desc" aria-live="polite">{error?'Cuerdas sin datos: '+error:description||'Escribe o dicta una solicitud para ver vibrar su cuerda.'}</p>
  </section>
  {expanded&&createPortal(<div className="gx-overlay" role="dialog" aria-modal="true" aria-label="Cuerdas de EscoIA">
{overlay}
  </div>,document.body)}
 </>;
}
