import React,{useState,useEffect,useRef} from 'react';
export type RequestEvent={id:number;task_id?:string;state:string;message:string;at:string};
type AcademicEvent={agent:string;state:string;message:string};
export function RequestGraph({events,busy,module,academic}:{events:RequestEvent[];busy:boolean;module?:string;academic:AcademicEvent|null}){
 const [floating,setFloating]=useState(true),[collapsed,setCollapsed]=useState(false);
 const [position,setPosition]=useState({x:Math.max(8,window.innerWidth-444),y:90});
 const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 function clamp(x:number,y:number){return {x:Math.max(8,Math.min(x,window.innerWidth-Math.min(420,window.innerWidth-16)-8)),y:Math.max(8,Math.min(y,window.innerHeight-(collapsed?120:Math.min(410,window.innerHeight-16))))};}
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('escoia.graph')||'null');if(saved){setFloating(Boolean(saved.floating));setPosition(clamp(Number(saved.x)||24,Number(saved.y)||90));}}catch{}},[]);
 useEffect(()=>{localStorage.setItem('escoia.graph',JSON.stringify({...position,floating}));},[position,floating]);
 useEffect(()=>{const resize=()=>setPosition(p=>clamp(p.x,p.y));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize)},[]);
 const newest=events[0];const run=events.filter(e=>e.task_id===newest?.task_id).slice().reverse();
 const isMixed=run.some(e=>e.state==='Cuantitativo');
 const isProgram=run.some(e=>['Planeación','Archivos'].includes(e.state));
 const isLesson=run.some(e=>e.state==='Investigación');
 const stages=isMixed?['Gateway','Cuantitativo','Qwen','Laya','Integración','Resultado']:module?['Gateway','Reglas de autorización',module,'Resultado']:isLesson?['Gateway','RAG','Investigación','Qwen','Laya','Didáctica',...(run.some(e=>e.state==='Notebook')?['Notebook']:[]),'Resultado']:isProgram?['Gateway','RAG','Planeación','Archivos','Resultado']:['Gateway','RAG','Qwen','Laya','Resultado'];
 const aliases:Record<string,string>={mcp_biometrics_tool:'Asistencia',mcp_surveys_tool:'Encuestas',mcp_scheduler_tool:'Horarios',mcp_grades_tool:'Calificaciones',LAYA:'Reglas de autorización'};
 const current=module?(aliases[academic?.agent||'']||academic?.agent):newest?.state;
 const terminal=module?academic?.state:newest?.state;
 const completed=['completada','completed'].includes(terminal||'');const failed=['fallida','bloqueada','retenida','failed','blocked'].includes(terminal||'');
 const fallback=completed&&/consulta estructurada|pendiente de revisión/i.test(newest?.message||'');
 const latestObserved=stages.filter(s=>run.some(e=>e.state===s)).at(-1);
 const running=module?Boolean(academic&&!completed&&!failed):busy;
 const activeIndex=stages.indexOf(current||'');
 function status(stage:string,i:number){
  if(stage==='Resultado')return completed?(fallback?'warning':'done'):failed?'error':'waiting';
  if(module){if(i===activeIndex&&!completed&&!failed)return 'active';if((completed||activeIndex>i)&&i<=activeIndex)return 'done';if(i===activeIndex&&failed)return 'error';return 'waiting';}
  const observed=run.some(e=>e.state===stage);
  if(failed&&stage===latestObserved)return 'error';
  if(fallback&&isLesson&&['Qwen','Laya'].includes(stage)&&observed)return 'warning';
  if(fallback&&stage===latestObserved&&['Qwen','Laya'].includes(stage))return 'warning';
  if(current===stage&&!completed&&!failed)return 'active';
  if(observed)return 'done';
  return 'waiting';
 }
 const width=600;const trackStart=158,trackEnd=564;
 const xs=stages.map((_,i)=>trackStart+i*(trackEnd-trackStart)/(stages.length-1));
 const cursor=completed?xs[stages.length-1]:failed?xs[stages.indexOf(latestObserved||'')>=0?stages.indexOf(latestObserved||''):stages.length-1]:activeIndex>=0?xs[activeIndex]:trackStart;
 const description=module?academic?.message:newest?.message;
 return <section className={'request-graph'+(floating?' floating-graph':'')} style={floating?{left:position.x,top:position.y}:undefined} aria-label="Constelaciones de la petición">
  <div className="graph-controls">
   {floating&&<button className="graph-drag" aria-label="Mover constelaciones; usa arrastrar o las flechas" onPointerDown={e=>{drag.current={x:e.clientX,y:e.clientY,px:position.x,py:position.y};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current)setPosition(clamp(drag.current.px+e.clientX-drag.current.x,drag.current.py+e.clientY-drag.current.y))}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onKeyDown={e=>{const delta:Record<string,number[]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(delta[e.key]){e.preventDefault();setPosition(p=>clamp(p.x+delta[e.key][0],p.y+delta[e.key][1]))}}}>⠿ Mover</button>}
   <button onClick={()=>setFloating(!floating)} title={floating?'Anclar en la página':'Abrir panel flotante'}>{floating?'↙ Anclar':'↗ Flotante'}</button>
   <button aria-label={collapsed?'Expandir constelaciones':'Minimizar constelaciones'} onClick={()=>setCollapsed(!collapsed)}>{collapsed?'+':'−'}</button>
  </div>
  <div className="graph-heading"><div><span className="graph-kicker">CONSTELACIONES EN VIVO</span><h2>Ruta de la petición</h2></div><span className={'graph-status '+(failed?'error':completed?'done':running?'active':'waiting')}>{failed?'Requiere atención':completed?(fallback?(isLesson?'Revisión pendiente':'Consulta con fuentes'):'Completada'):running?'En proceso':'En espera'}</span></div>
  {!collapsed&&<svg className="score-svg" viewBox={`0 0 ${width} ${stages.length*30+22}`} role="img" aria-label={stages.map((s,i)=>`${s}: ${status(s,i)}`).join(', ')}>
   <line className={'score-cursor'+(running?' playing':'')} x1={cursor} x2={cursor} y1="5" y2={stages.length*30+5}/>
   {stages.map((stage,i)=>{const state=status(stage,i),y=20+i*30;return <g key={stage} className={'graph-node '+state}>
    <title>{stage}: {state==='active'?'Ejecutándose':state==='done'?'Terminada':state==='warning'?'Revisión pendiente':state==='error'?'Requiere atención':'Pendiente'}</title>
    <text className="score-agent" x="2" y={y+4}>{stage==='Reglas de autorización'?'Permisos':stage}</text>
    <line className="score-staff" x1={trackStart} x2={trackEnd} y1={y} y2={y}/>
    {state==='active'&&<path className="graph-flow" d={`M ${trackStart} ${y} H ${trackEnd}`}/>}
    <circle className="graph-halo" cx={xs[i]} cy={y} r="13"/>
    <circle className="graph-circle" cx={xs[i]} cy={y} r="9"/>
    <text className="score-mark" textAnchor="middle" x={xs[i]} y={y+4}>{state==='done'?'✓':state==='warning'||state==='error'?'!':state==='active'?'●':''}</text>
    <text className="score-state" x={trackEnd+12} y={y+4}>{state==='active'?'▶':state==='done'?'✓':state==='warning'||state==='error'?'!':'·'}</text>
   </g>})}
  </svg>}
  <p className="graph-description" aria-live="polite">{description||'Escribe o dicta una solicitud para ver cómo avanza.'}</p>
  {!collapsed&&run.length>0&&!module&&<details className="graph-log"><summary>Ver registro de esta petición</summary><ol>{run.map(e=><li key={e.id}><time>{new Date(e.at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time><strong>{e.state}</strong><span>{e.message}</span></li>)}</ol></details>}
 </section>
}
