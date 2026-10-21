export type FaceMatch={studentId:number;score:number;margin:number};
/**
 * Consenso temporal: todas las capturas deben identificar al mismo alumno con
 * puntuación >= umbral y margen >= margen mínimo. Falla en cerrado: si la
 * configuración es inválida (p. ej. FACE_THRESHOLD=abc -> NaN), NUNCA acepta,
 * porque cualquier comparación con NaN es falsa y dejaría pasar a cualquiera.
 */
export function confirmFaceMatches(matches:FaceMatch[],threshold:number,margin:number,expected:number) {
 if(!Number.isFinite(threshold)||threshold<=0||threshold>1||!Number.isFinite(margin)||margin<0||margin>=1||!Number.isSafeInteger(expected)||expected<1)
  throw Error('Configuración biométrica inválida (FACE_THRESHOLD/FACE_MARGIN); no se registra asistencia');
 if(!Array.isArray(matches)||matches.length!==expected || matches.some(m=>!m||!Number.isSafeInteger(m.studentId)||m.studentId<1||!Number.isFinite(m.score)||!Number.isFinite(m.margin)||m.score<threshold||m.margin<margin||m.studentId!==matches[0].studentId))
  throw Error('Identidad no confirmada o coincidencia ambigua');
 return {...matches[0],meanScore:matches.reduce((sum,m)=>sum+m.score,0)/matches.length};
}
