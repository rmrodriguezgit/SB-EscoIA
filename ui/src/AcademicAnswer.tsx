import React from 'react';
export function AcademicAnswer({text}:{text:string}){
 const lines=text.split('\n');
 const pattern=/^- ([A-Z0-9]+) — (.*); ([\d.]+) h con académico y ([\d.]+) h independientes por semestre; ([\d.]+) créditos\. (.*)$/;
 if(!lines.some(line=>pattern.test(line)))return <div className="message-text">{text}</div>;
 const elements:React.ReactNode[]=[];
 for(let i=0;i<lines.length;i++){
  if(pattern.test(lines[i])){
   const rows:RegExpMatchArray[]=[];
   while(i<lines.length&&pattern.test(lines[i])){rows.push(lines[i].match(pattern)!);i++}i--;
   elements.push(<div className="academic-table-wrap" key={i}><table className="academic-answer-table"><thead><tr><th>Clave</th><th>Materia</th><th>Horas con docente</th><th>Horas independientes</th><th>Créditos</th><th>Fuente</th></tr></thead><tbody>{rows.map((r,n)=><tr key={n}><td><strong>{r[1]}</strong></td><td>{r[2]}</td><td>{r[3]}</td><td>{r[4]}</td><td>{r[5]}</td><td>{r[6]}</td></tr>)}</tbody></table><small>Horas totales por semestre.</small></div>);
  }else if(lines[i].trim())elements.push(<p className={lines[i].startsWith('Total calculado')?'academic-totals':''} key={i}>{lines[i]}</p>);
 }
 return <div className="academic-answer">{elements}</div>;
}
