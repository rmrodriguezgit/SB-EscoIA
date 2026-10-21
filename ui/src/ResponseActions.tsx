import React,{useState} from 'react';
export type Artifact={label:string;format:string;url:string};
export function ResponseActions({text,artifacts}:{text:string;artifacts?:Artifact[]}){
 const [feedback,setFeedback]=useState('');
 async function copy(){
  setFeedback('Copiando…');
  try{await Promise.race([navigator.clipboard.writeText(text),new Promise((_,reject)=>setTimeout(()=>reject(Error('Tiempo agotado')),2500))]);setFeedback('Copiado');}
  catch{
   const field=document.createElement('textarea');field.value=text;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();
   try{setFeedback(document.execCommand('copy')?'Copiado':'No se pudo copiar. Selecciona el texto y usa Cmd+C.');}catch{setFeedback('No se pudo copiar. Selecciona el texto y usa Cmd+C.');}finally{field.remove();}
  }
 }

 return <div className="response-actions">
  {artifacts?.filter(a=>/^\/api\/export\?id=[a-f0-9]{32}&format=(pdf|doc|docx|ipynb)$/.test(a.url)).map(a=><a key={a.format} className="download-action" href={a.url} download>{a.format==='pdf'?'↓ PDF':a.format==='doc'?'↓ Word .doc':a.format==='ipynb'?'↓ Notebook .ipynb':'↓ Word .docx'}</a>)}
  <button className="copy-icon" type="button" onClick={copy} aria-label="Copiar respuesta" title="Copiar respuesta"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg></button><span role="status">{feedback}</span>
 </div>
}
