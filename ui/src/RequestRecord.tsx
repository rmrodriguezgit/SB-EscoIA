import React,{useState} from 'react';
export type DocumentReview={state:string;label:string;current:boolean;revision:number;current_revision?:number;at?:string;engine?:string;reason?:string;hash?:string};
export function ReviewStatus({review,dirty=false}:{review?:DocumentReview;dirty?:boolean}) {
 const state=dirty?'outdated':review?.state||'pending';
 return <div className={'document-review '+state} role="status"><strong>{dirty?'Cambios sin guardar · revisión no vigente':review?.label||'Pendiente de revisión LAYA'}</strong>
 {review?.at&&<small>{review.engine} · {new Date(review.at).toLocaleString('es-MX')} · versión revisada {review.revision}</small>}
 {review?.hash&&<small title={review.hash}>Contenido {review.hash.slice(0,12)}{review.current&&!dirty?' · versión actual':''}</small>}
 {review?.reason&&<p>{review.reason}</p>}</div>;
}
type RecordData={id:string;has_result?:boolean;document_review?:DocumentReview;markdown:string;revision:number;status:string;integrity:boolean;summary?:string;artifacts?:{url:string;label:string}[];verification?:{passed:boolean;reason?:string}};
export function RequestRecord({id,csrf,verification,onUpdate,onDirtyChange,initialOpen=false}:{id:string;csrf:string;verification?:{passed:boolean};onUpdate?:()=>void;onDirtyChange?:(dirty:boolean)=>void;initialOpen?:boolean}){
 const[open,setOpen]=useState(initialOpen),[record,setRecord]=useState<RecordData|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function response(r:Response){const d=await r.json();if(!r.ok)throw Error(d.error||'No se completó la operación');return d;}
 async function load(){setBusy(true);setError('');try{const d=await response(await fetch('/api/request?id='+id));setRecord(d);setText(d.markdown);onUpdate?.()}catch(e){setError(String(e))}finally{setBusy(false)}}
 React.useEffect(()=>{if(open)void load()},[open,id]);
 React.useEffect(()=>{if(record?.status!=='ejecutándose')return;const interval=setInterval(()=>void load(),3000);return()=>clearInterval(interval)},[record?.status]);
 async function action(mode:'save'|'delivery'|'document'){
  setBusy(true);setError('');
  try{
   if(mode==='document'){
    const h=await response(await fetch('/api/request-git?id='+id));
    await response(await fetch('/api/request-git',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({id,action:'review',name:'request.md',head:h.head,revision:record?.revision})}));
    const d=await response(await fetch('/api/request?id='+id));setRecord(d);setText(d.markdown);
   }else{
    const d=await response(await fetch('/api/request',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(mode==='delivery'?{id,action:'verify'}:{id,markdown:text,revision:record?.revision})}));setRecord(d);setText(d.markdown);
   }
   onUpdate?.();
  }catch(e){setError(String(e))}finally{setBusy(false)}
 }
 const dirty=!!record&&text!==record.markdown;
 React.useEffect(()=>{onDirtyChange?.(dirty)},[dirty]);
 return <details className="request-record" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
 <summary>Expediente de petición · .md{record?' · '+(dirty?'sin guardar':record.document_review?.label||record.status):verification?' · verificación registrada':''}</summary>
 <p><code>{id}</code> · <a href={'/api/request?id='+id+'&format=md'}>Descargar Markdown</a></p>
 {record&&<><p>Versión {record.revision} · Petición: {record.status}{!record.integrity?' · Archivo modificado fuera del editor':''}</p>
 <ReviewStatus review={record.document_review} dirty={dirty}/>
 <p>{record.summary}</p>
 {!!record.artifacts?.length&&<p className="record-actions">{record.artifacts.map(a=><a key={a.url} href={a.url}>{a.label}</a>)}</p>}
 <textarea aria-label="Expediente Markdown editable" disabled={busy||record.status==='ejecutándose'} value={text} onChange={e=>setText(e.target.value)} rows={16}/>
 <p className="record-actions"><button disabled={busy||record.status==='ejecutándose'||!dirty} onClick={()=>void action('save')}>Guardar nueva versión</button><button disabled={busy||!dirty} onClick={()=>setText(record.markdown)}>Descartar cambios sin guardar</button><button disabled={busy||record.status==='ejecutándose'||dirty} onClick={()=>void action('document')}>{busy?'Procesando…':'Revisar Markdown con LAYA'}</button><button disabled={busy||!record.has_result||record.status==='ejecutándose'||dirty} onClick={()=>void action('delivery')}>Comprobar entrega y archivos</button></p>
 <small>Guarda antes de revisar. La aprobación pertenece al contenido y versión revisados; editar o restaurar invalida su vigencia. Revisar el Markdown no ejecuta la petición ni sustituye la comprobación de sus entregables.</small>
 {record.verification?.reason&&<details><summary>Comprobación de la entrega</summary><p>{record.verification.reason}</p></details>}</>}
 {busy&&<p role="status">Procesando… La revisión puede tardar; espera a que termine.</p>}{error&&<p role="alert">{error}</p>}</details>;
}
export function RequestHistory({csrf}:{csrf:string}){
 const[items,setItems]=useState<any[]>([]),[error,setError]=useState('');
 async function refresh(){try{const r=await fetch('/api/requests');if(!r.ok)throw Error('No se pudo abrir el historial');setItems(await r.json())}catch(e){setError(String(e))}}
 React.useEffect(()=>{void refresh()},[]);
 return <section className="request-history"><h2>Expedientes de peticiones</h2><button onClick={()=>void refresh()}>Actualizar expedientes</button>{error&&<p role="alert">{error}</p>}{items.map(item=><article key={item.id}><h3>{item.original_request}</h3><small>{item.status} · Versión {item.revision}</small><RequestRecord id={item.id} csrf={csrf} onUpdate={()=>void refresh()}/></article>)}</section>;
}
