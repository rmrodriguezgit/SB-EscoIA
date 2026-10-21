import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCurrent } from '../server/current_attendance.js';
import type { Native } from '../server/native.js';
const block = {materia:'LAR105',grupo:'LAR-101',periodo:'AGO-DIC 2026',starts:100,ends:200};
function fake() {
 const calls: string[] = [], schedules: any[] = [];
 const native = {async call(op:string, params:any[]=[]) {
  calls.push(op);
  if(op==='subjects') return [{id:1,code:'LAR105',name:'Prácticas'}];
  if(op==='groups') return [{id:2,code:'LAR-101'}];
  if(op==='offerings') return [{id:3,teacher_id:7,subject_id:1,group_id:2,term:block.periodo},{id:4,teacher_id:7,subject_id:2,group_id:3,term:block.periodo}];
  if(op==='schedules') return schedules;
  if(op==='rooms') return [{id:9,name:'Registro de asistencia (docente 7)'}];
  if(op==='schedule_create') { schedules.push({id:10,offering_id:params[0],starts:params[2],ends:params[3]}); return {id:10}; }
  throw Error(op);
 }} as unknown as Native;
 return {native,calls,schedules};
}
test('Consultar el reloj y horario no escribe clases', async () => {
 const f=fake(); const result=await ensureCurrent(f.native,7,undefined,async()=>[block]);
 assert.equal(result.candidates?.[0].group_code,'LAR-101');
 assert.deepEqual(result.active,[]);
 assert.ok(!f.calls.includes('schedule_create') && !f.calls.includes('room_create'));
});
test('Confirmar otro grupo del docente conserva el bloque y no duplica',async()=>{
 const f=fake();
 assert.deepEqual((await ensureCurrent(f.native,7,4,async()=>[block])).active,[10]);
 assert.deepEqual((await ensureCurrent(f.native,7,4,async()=>[block])).active,[10]);
 assert.equal(f.schedules[0].offering_id,4);
 assert.equal(f.calls.filter(c=>c==='schedule_create').length,1);
});
test('No acepta otro docente ni bloques simultáneos',async()=>{
 const f=fake();
 await assert.rejects(ensureCurrent(f.native,7,99,async()=>[block]),/no pertenece/);
 await assert.rejects(ensureCurrent(f.native,7,3,async()=>[block,block]),/simultáneas/);
 assert.equal(f.schedules.length,0);
});
