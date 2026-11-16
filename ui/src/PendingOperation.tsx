import {useState} from 'react';

// Una orden administrativa del chat, de una tarea o del MCP solo prepara la operación.
// La base de datos cambia únicamente cuando una persona pulsa Confirmar aquí.
export function PendingOperation({id,summary,csrf}:{id:string;summary:string;csrf:string}){
 const [state,setState]=useState<'pendiente'|'enviando'|'confirmada'|'cancelada'>('pendiente');
 const [message,setMessage]=useState('');
 async function decide(decision:'confirm'|'reject'){
  setState('enviando');setMessage('');
  try{
   const r=await fetch('/api/attendance/decision',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({id,decision})});
   const data=await r.json();if(!r.ok)throw Error(data.error);
   setState(data.status);setMessage(data.text+(data.verification?.reason?' '+data.verification.reason:''));
  }catch(e){setState('pendiente');setMessage((e as Error).message)}
 }
 return <div className="pending-operation" role="group" aria-label="Operación pendiente de confirmación">
  <strong>{state==='confirmada'?'Operación confirmada':state==='cancelada'?'Operación cancelada':'Requiere tu confirmación'}</strong>
  <p>{summary}</p>
  {(state==='pendiente'||state==='enviando')&&<div><button className="danger" disabled={state==='enviando'} onClick={()=>void decide('confirm')}>Confirmar retiro</button><button disabled={state==='enviando'} onClick={()=>void decide('reject')}>Cancelar</button></div>}
  {message&&<small role="status">{message}</small>}
 </div>;
}
