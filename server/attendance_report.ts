import type { Row } from './native.js';
/**
 * Valor de cada celda de la matriz mensual:
 *  1    = asistencia ('present')
 *  'J'  = falta justificada ('excused'): NO suma faltas, igual que la vista absence_totals
 *  0    = falta ('absent' o 'Falta' calculada por horario)
 *  null = clase futura ('Pendiente') o cancelada ('Cancelada')
 */
export type MatrixValue = 1 | 0 | 'J' | null;
export function cellValue(status: unknown): MatrixValue {
 if(status==='present') return 1;
 if(status==='excused') return 'J';
 if(status==='Pendiente'||status==='Cancelada') return null;
 return 0;
}
export function monthlyMatrix(rows: Row[], sources: Row[]) {
 const groups = new Map<string,{group:string;subject:string;columns:Row[];students:Row[]}>();
 for(const row of rows) {
  const key = `${row.group}:${row.subject}`;
  let group = groups.get(key);
  if(!group) {group={group:row.group,subject:row.subject,columns:[],students:[]};groups.set(key,group);}
  const column = `${row.starts}:${row.ends}`;
  if(!group.columns.some(c => c.key===column)) group.columns.push({key:column,date:row.date,starts:row.starts,ends:row.ends});
  let student=group.students.find(s=>s.number===row.number);
  if(!student) {
   // Fuentes sin "context" o sin "roster" no deben tumbar el reporte completo.
   const roster=sources.find(s=>s?.kind==='lista' && (s.context?.grupo===row.group || s.roster?.some((r:Row)=>r?.grupo===row.group)))?.roster || [];
   const index=roster.findIndex((r:Row)=>String(r?.matricula)===String(row.number));
   student={number:row.number,name:row.name,list_number:index>=0?index+1:null,values:{},total_attendance:0,total_absence:0,total_excused:0};group.students.push(student);
  }
  student.values[column]=cellValue(row.status);
 }
 for(const group of groups.values()) {
  group.columns.sort((a,b)=>a.starts-b.starts);
  group.students.sort((a,b)=>(a.list_number ?? 9999)-(b.list_number ?? 9999)||String(a.name).localeCompare(String(b.name)));
  for(const student of group.students) {
   const values=Object.values(student.values);
   student.total_attendance=values.filter(v=>v===1).length;
   student.total_absence=values.filter(v=>v===0).length;
   student.total_excused=values.filter(v=>v==='J').length;
  }
 }
 return [...groups.values()];
}
