export type FaceMatch={studentId:number;score:number;margin:number};
export function confirmFaceMatches(matches:FaceMatch[],threshold:number,margin:number,expected:number) {
 if(matches.length!==expected || !matches.length || matches.some(m=>!Number.isSafeInteger(m.studentId)||m.studentId<1||!Number.isFinite(m.score)||!Number.isFinite(m.margin)||m.score<threshold||m.margin<margin||m.studentId!==matches[0].studentId))
  throw Error('Identidad no confirmada o coincidencia ambigua');
 return {...matches[0],meanScore:matches.reduce((sum,m)=>sum+m.score,0)/matches.length};
}
