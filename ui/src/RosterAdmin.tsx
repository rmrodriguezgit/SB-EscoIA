import {useEffect,useState} from 'react';
import {request} from './api';
type Row=Record<string,any>;
export function RosterAdmin({onChanged}:{onChanged:()=>void}) {
 const [offers,setOffers]=useState<Row[]>([]),[students,setStudents]=useState<Row[]>([]),[members,setMembers]=useState<Row[]>([]);
 const [offer,setOffer]=useState(''),[selected,setSelected]=useState(''),[number,setNumber]=useState(''),[name,setName]=useState(''),[target,setTarget]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function load(){const [o,s,e]=await Promise.all([request('records/offerings'),request('records/students'),request('records/enrollments')]);setOffers(o);setStudents(s);setMembers(e);}
 useEffect(()=>{void load().catch(e=>setMessage(String(e)));},[]);
 function clear(){setSelected('');setNumber('');setName('');setTarget('');}
 async function save(action:string){
  if(action==='remove'&&!confirm(`¿Retirar a ${name} de esta lista? Se conserva su historial y biometría.`))return;
  if(action==='move'&&!confirm(`¿Cambiar a ${name} al grupo/materia seleccionado? Se conserva la asistencia anterior.`))return;
  setBusy(true);setMessage('Guardando…');
  try{const r=await request('attendance/roster',{action,offeringId:Number(offer),studentId:selected?Number(selected):undefined,targetId:target?Number(target):undefined,number:number.trim(),name:name.trim()});setMessage(r.message);await load();clear();onChanged();}catch(e){setMessage(String(e));}finally{setBusy(false);}
 }
 const roster=students.filter(s=>members.some(e=>e.offering_id===Number(offer)&&e.student_id===s.id));
 return <details className="roster-admin"><summary>Administrar listas por grupo · altas, cambios y bajas</summary>
  <p>Gestiona la inscripción por grupo y materia. Retirar al alumno no borra sus asistencias ni su rostro.</p>
  <fieldset disabled={busy} className="attendance-context">
   <label>Lista del grupo y materia<select value={offer} onChange={e=>{setOffer(e.target.value);clear();}}><option value="">Selecciona una lista</option>{offers.map(o=><option key={o.id} value={o.id}>{o.group_code} · {o.subject} · {o.term} · {o.teacher}</option>)}</select></label>
   {offer&&<>
    <div className="capture-panel-heading"><h3>{roster.length} alumnos inscritos</h3><button onClick={clear} type="button">＋ Nuevo alumno</button></div>
    <label>Alumno para editar o cambiar de grupo<select value={selected} onChange={e=>{const s=roster.find(s=>String(s.id)===e.target.value);setSelected(e.target.value);setNumber(s?.number||'');setName(s?.name||'');setTarget('');}}><option value="">Alta nueva / elegir alumno</option>{roster.map(s=><option key={s.id} value={s.id}>{s.name} · {s.number}</option>)}</select></label>
    <label>Matrícula<input value={number} onChange={e=>setNumber(e.target.value)} /></label>
    <label>Nombre completo<input value={name} onChange={e=>setName(e.target.value)} /></label>
    {selected&&<p className="muted">Nombre y matrícula pertenecen al alumno: corregirlos actualiza sus datos en todas sus listas. Su ID y biometría se conservan.</p>}
    <div className="actions"><button disabled={!number.trim()||!name.trim()} onClick={()=>void save(selected?'edit':'add')}>{selected?'Guardar cambios':'Dar de alta e inscribir'}</button>{selected&&<button className="secondary" onClick={()=>void save('remove')}>Retirar de esta lista</button>}</div>
    {selected&&<><label>Cambiar a grupo y materia<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Selecciona destino</option>{offers.filter(o=>String(o.id)!==offer).map(o=><option key={o.id} value={o.id}>{o.group_code} · {o.subject} · {o.term}</option>)}</select></label><button disabled={!target} onClick={()=>void save('move')}>Cambiar de grupo / materia</button></>}
   </>}
  </fieldset><p role="status">{message}</p>
 </details>;
}
