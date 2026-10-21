"""Trabajador CPU aislado: estadística y PDF. No carga modelos."""
import json,math,sys,statistics,collections,html

def quantitative(payload):
 from scipy import stats
 questions=payload['questions'];rows=payload['responses'];out=[]
 for q in questions:
  if q['kind'] in ['text','audio']:continue
  values=[r['answers'][q['id']] for r in rows if q['id'] in r['answers']]
  counts=collections.Counter(str(v) for value in values for v in (value if isinstance(value,list) else [value]))
  entry={'id':q['id'],'title':q['title'],'kind':q['kind'],'n':len(values),'missing':len(rows)-len(values),'frequencies':dict(counts),'percentages':{k:round(v/max(1,len(values))*100,2) for k,v in counts.items()}}
  if q['kind']=='likert' and values:
   entry.update(mean=statistics.mean(values),sd=statistics.stdev(values) if len(values)>1 else None,median=statistics.median(values),note='Media de Likert supone intervalos comparables; se muestran también distribución y mediana.')
  if q['kind']=='multiple':entry['note']='Porcentajes por respondente; pueden sumar más de 100%.'
  if q['kind']=='likert':
   for k in range(1,6):entry['frequencies'].setdefault(str(k),0);entry['percentages'].setdefault(str(k),0.0)
  out.append(entry)
 hypothesis=payload.get('hypothesis') or {};infer={'status':'not_planned','reason':'Define hipótesis, prueba y variables antes de analizar.'}
 if hypothesis.get('test'):
  x,y=hypothesis['x'],hypothesis['y'];test=hypothesis['test'];qm={q['id']:q for q in questions};pairs=[(r['answers'][x],r['answers'][y]) for r in rows if x in r['answers'] and y in r['answers']]
  if x not in qm or y not in qm:raise ValueError('Variable inexistente')
  if x==y:raise ValueError('Variables deben ser distintas')
  if any(isinstance(v,list) for pair in pairs for v in pair):raise ValueError('Selección múltiple requiere codificar indicadores antes de inferencia')
  infer={'status':'insufficient','n':len(pairs),'test':test,'hypothesis':hypothesis['statement'],'alpha':hypothesis.get('alpha',.05)}
  if len(pairs)>=4:
   xs,ys=zip(*pairs);groups={str(k):[b for a,b in pairs if str(a)==str(k)] for k in sorted(set(xs),key=str)}
   assumptions=[];effect=None
   if test=='chi2':
    catsx=sorted(set(map(str,xs)));catsy=sorted(set(map(str,ys)));table=[[sum(str(a)==i and str(b)==j for a,b in pairs) for j in catsy] for i in catsx]
    if min(len(catsx),len(catsy))<2:raise ValueError('Chi-cuadrada requiere al menos dos categorías por variable')
    result=stats.chi2_contingency(table,correction=False);stat,p=float(result.statistic),float(result.pvalue)
    infer.update(table=table,rows=catsx,columns=catsy,expected=result.expected_freq.tolist(),df=int(result.dof))
    if (result.expected_freq<5).any():infer.update(status='assumptions_failed',reason='Frecuencias esperadas menores de 5; no interpretar aproximación chi-cuadrada.');return {'metrics':out,'inferential':infer}
    effect={'cramers_v':math.sqrt(stat/(len(pairs)*min(len(catsx)-1,len(catsy)-1)))};assumptions=['Observaciones independientes; una categoría por participante; frecuencias esperadas >=5.']
   elif test in ['welch','anova']:
    if qm[y]['kind']!='likert':raise ValueError('Respuesta debe ser numérica Likert; no convertir categorías en cantidades')
    if any(len(g)<2 for g in groups.values()):raise ValueError('Cada grupo necesita al menos dos observaciones')
    if test=='welch':
     if len(groups)!=2:raise ValueError('Welch requiere dos grupos independientes')
     g=list(groups.values());r=stats.ttest_ind(*g,equal_var=False);stat,p=float(r.statistic),float(r.pvalue);effect={'difference':statistics.mean(g[0])-statistics.mean(g[1]),'group_order':list(groups)}
    else:
     if len(groups)<3:raise ValueError('ANOVA requiere al menos tres grupos en este diseño')
     r=stats.f_oneway(*groups.values());stat,p=float(r.statistic),float(r.pvalue)
    assumptions=['Independencia, normalidad aproximada de errores y tratamiento intervalar de Likert deben justificarse. ANOVA clásico además requiere varianzas comparables. No comprobados automáticamente.']
   elif test=='regression':
    if any(qm[k]['kind']!='likert' for k in [x,y]):raise ValueError('Regresión requiere dos variables numéricas')
    if len(set(xs))<2:raise ValueError('Predictor constante')
    r=stats.linregress(xs,ys);stat,p=float(r.slope),float(r.pvalue);effect={'slope':float(r.slope),'intercept':float(r.intercept),'r_squared':float(r.rvalue**2),'slope_se':float(r.stderr)};assumptions=['Linealidad, independencia, homocedasticidad y normalidad de errores; no comprobados. Escalas Likert tratadas como intervalares explícitamente.']
   else:raise ValueError('Prueba no permitida')
   if not math.isfinite(stat) or not math.isfinite(p):infer.update(status='invalid',reason='Datos constantes o varianza insuficiente; resultado no finito.')
   else:infer.update(status='calculated_conditional',statistic=stat,p=p,effect=effect,assumptions=assumptions,interpretation=('p < alpha: evidencia contra H0 bajo los supuestos.' if p<infer['alpha'] else 'p >= alpha: evidencia insuficiente para rechazar H0; no demuestra igualdad.'),limitations='Una prueba preespecificada; muestra por conveniencia no garantiza generalización. p no mide importancia ni probabilidad de H0.')
 return {'metrics':out,'inferential':infer}

def pdf(payload):
 from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
 from reportlab.lib.styles import getSampleStyleSheet
 from reportlab.lib import colors
 from reportlab.lib.pagesizes import A4
 from reportlab.graphics.shapes import Drawing,Rect,String
 study=payload['study'];analysis=payload['analysis'];styles=getSampleStyleSheet();styles['Title'].fontSize=19;styles['Heading1'].fontSize=14;styles['Heading2'].fontSize=11;styles['BodyText'].fontSize=10;styles['BodyText'].leading=14
 styles['BodyText'].spaceAfter=7;styles['Heading1'].spaceAfter=9;styles['Heading2'].spaceAfter=7
 story=[]
 def p(text,style='BodyText'):story.append(Paragraph(html.escape(str(text)).replace('\n','<br/>'),styles[style]))
 p('EscoIA | Investigación mixta','Title');p(study['title'],'Heading1');p('Reporte académico · '+payload['date']);p('DEMOSTRACIÓN — DATOS SIMULADOS. No son hallazgos institucionales.' if study.get('demo') else 'Datos registrados localmente; comprobar protocolo y revisión humana.');p('1. Definición y diseño','Heading1')
 for label,key in [('Pregunta central','question'),('Objetivo general','objective'),('Objetivos específicos','specific'),('Hipótesis','hypothesis_text'),('Muestreo','sampling')]:p(label+': '+str(study.get(key,'')))
 p(f"Plan: N={study['target_n']}; entrevistas n={study['qual_target']}. Recopiladas: {analysis['sample']['n']}; entrevistas con narrativa: {analysis['sample']['qual_n']}. No se asume cumplimiento de objetivos por completar el formulario.")
 p('2. Resultados cuantitativos','Heading1')
 for m in analysis['metrics']:
  p(m['title'],'Heading2');p(f"n={m['n']}; ausentes={m['missing']}; media={round(m['mean'],2) if 'mean' in m else 'no aplica'}; desviación={round(m['sd'],2) if m.get('sd') is not None else 'no aplica'}")
  rows=[['Respuesta','Frecuencia','% respondentes']]+[[k,str(v),str(m['percentages'][k])] for k,v in m['frequencies'].items()]
  t=Table([[Paragraph(html.escape(str(v)),styles['BodyText']) for v in row] for row in rows],colWidths=[280,90,100],repeatRows=1);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e8edf5')),('GRID',(0,0),(-1,-1),.3,colors.lightgrey),('VALIGN',(0,0),(-1,-1),'TOP')]));story.append(t);story.append(Spacer(1,10))
  drawing=Drawing(460,30+22*len(m['frequencies']))
  for i,(label,count) in enumerate(m['frequencies'].items()):
   y=10+22*i;drawing.add(String(0,y+3,str(label)[:32],fontSize=8));drawing.add(Rect(180,y,220*count/max(1,m['n']),12,fillColor=colors.HexColor('#657caa'),strokeColor=None));drawing.add(String(410,y+3,str(count),fontSize=8))
  story.append(drawing);story.append(Spacer(1,12))
 p('3. Inferencia vinculada a hipótesis','Heading1')
 inf=analysis['inferential'];p('Prueba: '+str(inf.get('test','Sin plan'))+' · pares completos: '+str(inf.get('n',0)));p('Hipótesis nula: '+inf.get('hypothesis','No preespecificada'))
 if 'p' in inf:p(f"Estadístico={inf['statistic']:.4f}; p={inf['p']:.8g}; alpha={inf['alpha']}.");p(inf['interpretation']);p('Magnitud del efecto: '+json.dumps(inf.get('effect'),ensure_ascii=False))
 else:p(inf.get('reason','Datos insuficientes.'))
 for assumption in inf.get('assumptions',[]):p('Supuestos: '+assumption)
 p(inf.get('limitations','No extrapolar a una población sin un diseño de muestreo justificado.'))
 p('4. Narrativas y codificación','Heading1')
 for c in analysis['qualitative']:
  start=len(story)
  p(f"{c['respondent']} | {c['question_id']} | {c['sentiment']} | revisión: {'Sí' if c.get('reviewed') else 'Pendiente'}",'Heading2');p('Cita: '+c['quote']);p('Códigos: '+', '.join(c['codes'])+'; emociones: '+', '.join(c['emotions']));p('Procedencia: '+c['method']);block=story[start:];del story[start:];story.append(KeepTogether(block))
 p('5. Triangulación y objetivos','Heading1')
 for row in analysis['integration']:p(row['objective']+': '+row['finding']+' | '+row['status'])
 p('Conclusión del investigador: '+(study.get('conclusion') or 'Consultar la integración por objetivos; conclusión general pendiente de revisión.'))
 p('6. Limitaciones y referencias','Heading1');p('No se infiere causalidad. El subconjunto cualitativo no representa automáticamente a los 50 participantes. Sentimientos y temas automáticos son propuestas. Supuestos estadísticos deben revisarse. Audio: transcripción requiere revisión. No se inventan benchmarks.')
 for ref in analysis.get('references',[]):p(ref['citation']+' '+ref['url'])
 def footer(canvas,doc):canvas.setFont('Helvetica',8);canvas.drawString(40,25,'EscoIA · Reporte local · '+str(doc.page))
 SimpleDocTemplate(payload['path'],pagesize=A4,rightMargin=40,leftMargin=40,topMargin=40,bottomMargin=40).build(story,onFirstPage=footer,onLaterPages=footer)
 return {'path':payload['path']}
if __name__=='__main__':
 payload=json.load(sys.stdin)
 try:
  if payload.get('action')=='lexical':
   sys.path.insert(0,str(__import__('pathlib').Path(__file__).resolve().parents[1]));from second_brain.research import lexical;result=lexical(payload['study'])
  else:result=pdf(payload) if payload.get('action')=='pdf' else quantitative(payload)
  print(json.dumps(result,ensure_ascii=False,allow_nan=False))
 except Exception as e:print(json.dumps({'error':str(e)}));sys.exit(1)
