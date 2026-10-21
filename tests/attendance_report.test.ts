import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyMatrix } from '../server/attendance_report.js';
test('Matriz mensual: 1 presente, 0 falta, sin faltas futuras ni duplicación de totales',()=>{
 const common={group:'LAR-101',subject:'LAR105',number:'00123',name:'Alumno'};
 const rows=['present','Falta','Pendiente','Cancelada'].map((status,i)=>({...common,date:'2026-10-12',starts:i,ends:i+1,status}));
 rows.push(rows[0]);
 const [group]=monthlyMatrix(rows,[{kind:'lista',context:{grupo:'LAR-101'},roster:[{matricula:'00123'}]}]);
 assert.equal(group.columns.length,4);
 const student=group.students[0];
 assert.equal(student.list_number,1);
 assert.deepEqual(student.values,{'0:1':1,'1:2':0,'2:3':null,'3:4':null});
 assert.equal(student.total_attendance,1);assert.equal(student.total_absence,1);
});
