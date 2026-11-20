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
  if q['kind']=='number' and values:
   entry.update(mean=statistics.mean(values),sd=statistics.stdev(values) if len(values)>1 else None,median=statistics.median(values),min=min(values),max=max(values),frequencies={},percentages={})
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
   if test in ['t_paired','wilcoxon','spearman','mannwhitney']:
    num={'likert','number'}
    if test=='mannwhitney':
     if qm[y]['kind'] not in num or len(groups)!=2:raise ValueError('Mann-Whitney: X con dos grupos y Y numérica')
     g=list(groups.values());r=hypothesis_test({'test':test,'x':g[0],'y':g[1],'alternative':hypothesis.get('alternative','two-sided'),'alpha':infer['alpha']});r['group_order']=list(groups)
    else:
     if any(qm[k]['kind'] not in num for k in [x,y]):raise ValueError('La prueba requiere dos variables numéricas o Likert')
     r=hypothesis_test({'test':test,'x':list(xs),'y':list(ys),'alternative':hypothesis.get('alternative','two-sided'),'alpha':infer['alpha']})
    infer.update(status='calculated_conditional',**{k:v for k,v in r.items() if k not in ['test','alpha','status','interpretation','limitations']},interpretation=('p < alpha: evidencia contra H0 bajo los supuestos.' if r['p']<infer['alpha'] else 'p >= alpha: evidencia insuficiente para rechazar H0; no demuestra igualdad.'),limitations='Diseño de un grupo sin control: no prueba causalidad. p no mide importancia.')
    return {'metrics':out,'inferential':infer}
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

TESTS={
 't_one':'t de Student · una muestra','t_ind':'t de Student · muestras independientes','welch':'t de Welch · muestras independientes',
 't_paired':'t de Student · muestras pareadas','anova':'ANOVA de un factor','pearson':'Correlación de Pearson','regression':'Regresión lineal simple',
 'mannwhitney':'U de Mann-Whitney','wilcoxon':'Rangos con signo de Wilcoxon','kruskal':'H de Kruskal-Wallis','spearman':'Correlación de Spearman',
 'chi2_ind':'χ² de independencia','chi2_gof':'χ² de bondad de ajuste'}

def _nums(v,name):
 if not isinstance(v,list) or not v:raise ValueError(f'{name}: lista de números vacía')
 out=[float(x) for x in v]
 if not all(math.isfinite(x) for x in out):raise ValueError(f'{name}: valores no finitos')
 return out

def _magnitude(kind,v):
 v=abs(v)
 cuts={'d':(.2,.5,.8),'r':(.1,.3,.5),'eta2':(.01,.06,.14),'w':(.1,.3,.5)}[kind]
 return 'despreciable' if v<cuts[0] else 'pequeño' if v<cuts[1] else 'mediano' if v<cuts[2] else 'grande'

def hypothesis_test(payload):
 """Prueba de hipótesis sobre datos ya capturados. Devuelve estadístico, p, gl, tamaño del efecto y supuestos; nunca inventa datos."""
 from scipy import stats
 test=payload.get('test');alpha=float(payload.get('alpha',.05));tails=payload.get('alternative','two-sided')
 if test not in TESTS:raise ValueError('Prueba no permitida')
 if not 0<alpha<1:raise ValueError('Alpha inválido')
 if tails not in {'two-sided','less','greater'}:raise ValueError('Hipótesis alternativa inválida')
 out={'test':test,'label':TESTS[test],'alpha':alpha,'alternative':tails,'warnings':[]}
 x=lambda:_nums(payload.get('x'),'X');y=lambda:_nums(payload.get('y'),'Y')
 def groups():
  g=payload.get('groups') or {}
  if not isinstance(g,dict) or len(g)<2:raise ValueError('Se requieren al menos dos grupos')
  g={str(k):_nums(v,'Grupo '+str(k)) for k,v in g.items()}
  if any(len(v)<2 for v in g.values()):raise ValueError('Cada grupo necesita al menos dos observaciones')
  return g
 if test=='t_one':
  a=x();mu=float(payload.get('mu',0))
  if len(a)<2:raise ValueError('Se requieren al menos dos observaciones')
  r=stats.ttest_1samp(a,mu,alternative=tails);sd=statistics.stdev(a);d=(statistics.mean(a)-mu)/sd if sd else float('nan')
  out.update(statistic=float(r.statistic),p=float(r.pvalue),df=len(a)-1,n=len(a),effect={'name':'d de Cohen','value':d,'magnitude':_magnitude('d',d)},
   descriptives={'media':statistics.mean(a),'de':sd,'mu':mu},assumptions=['Observaciones independientes','Normalidad aproximada (o n ≥ 30)'])
 elif test in {'t_ind','welch','mannwhitney'}:
  g=groups()
  if len(g)!=2:raise ValueError('Esta prueba compara exactamente dos grupos')
  (ka,a),(kb,b)=g.items();na,nb=len(a),len(b)
  if test=='mannwhitney':
   r=stats.mannwhitneyu(a,b,alternative=tails);rb=1-2*float(r.statistic)/(na*nb)
   out.update(statistic=float(r.statistic),p=float(r.pvalue),n=na+nb,effect={'name':'correlación biserial por rangos','value':rb,'magnitude':_magnitude('r',rb)},
    descriptives={ka:{'mediana':statistics.median(a),'n':na},kb:{'mediana':statistics.median(b),'n':nb}},assumptions=['Grupos independientes','Variable al menos ordinal; formas de distribución comparables para hablar de medianas'])
  else:
   r=stats.ttest_ind(a,b,equal_var=test=='t_ind',alternative=tails)
   sp=math.sqrt(((na-1)*statistics.variance(a)+(nb-1)*statistics.variance(b))/(na+nb-2));d=(statistics.mean(a)-statistics.mean(b))/sp if sp else float('nan')
   g_=d*(1-3/(4*(na+nb)-9)) if math.isfinite(d) else d
   df=float(r.df) if hasattr(r,'df') else na+nb-2
   lev=stats.levene(a,b)
   if test=='t_ind' and lev.pvalue<.05:out['warnings'].append(f'Levene p={lev.pvalue:.4f}: varianzas distintas; usa Welch')
   out.update(statistic=float(r.statistic),p=float(r.pvalue),df=df,n=na+nb,effect={'name':'g de Hedges','value':g_,'magnitude':_magnitude('d',g_)},
    descriptives={ka:{'media':statistics.mean(a),'de':statistics.stdev(a),'n':na},kb:{'media':statistics.mean(b),'de':statistics.stdev(b),'n':nb}},
    assumptions=['Grupos independientes','Normalidad aproximada en cada grupo']+(['Varianzas homogéneas (Levene p=%.4f)'%lev.pvalue] if test=='t_ind' else []))
 elif test in {'t_paired','wilcoxon'}:
  a,b=x(),y()
  if len(a)!=len(b):raise ValueError('Las muestras pareadas deben tener el mismo tamaño')
  diff=[i-j for i,j in zip(a,b)]
  if len(a)<3:raise ValueError('Se requieren al menos tres pares')
  if len(set(diff))>1:
   sw=stats.shapiro(diff);out['normality']={'test':'Shapiro-Wilk sobre d','W':float(sw.statistic),'p':float(sw.pvalue),'normal':bool(sw.pvalue>.05)}
   if test=='t_paired' and sw.pvalue<=.05:out['warnings'].append(f'Shapiro-Wilk p={sw.pvalue:.4f}: d no normal; usa Wilcoxon')
   if len(a)<30:out['warnings'].append('n<30: Shapiro-Wilk tiene poca potencia; reporta t y Wilcoxon como sensibilidad')
  if test=='t_paired':
   r=stats.ttest_rel(a,b,alternative=tails);sd=statistics.stdev(diff);dz=statistics.mean(diff)/sd if sd else float('nan')
   out.update(statistic=float(r.statistic),p=float(r.pvalue),df=len(a)-1,n=len(a),effect={'name':'dz de Cohen','value':dz,'magnitude':_magnitude('d',dz)},
    descriptives={'media_diferencia':statistics.mean(diff),'de_diferencia':sd},assumptions=['Pares dependientes','Diferencias aproximadamente normales'])
  else:
   nz=[d for d in diff if d!=0]
   if len(nz)<3:raise ValueError('Muy pocas diferencias distintas de cero')
   r=stats.wilcoxon(a,b,alternative=tails);ranks=stats.rankdata([abs(d) for d in nz])
   wp=sum(rk for rk,d in zip(ranks,nz) if d>0);wn=sum(rk for rk,d in zip(ranks,nz) if d<0);rb=(wp-wn)/(wp+wn)
   if len(nz)<len(diff):out['warnings'].append(f'{len(diff)-len(nz)} empate(s) en cero excluidos')
   out.update(statistic=float(r.statistic),p=float(r.pvalue),n=len(a),effect={'name':'biserial por rangos pareada','value':rb,'magnitude':_magnitude('r',rb)},
    descriptives={'mediana_diferencia':statistics.median(diff)},assumptions=['Pares dependientes','Distribución de diferencias aproximadamente simétrica'])
 elif test in {'anova','kruskal'}:
  g=groups();vals=list(g.values());n=sum(map(len,vals));k=len(vals)
  if test=='anova':
   r=stats.f_oneway(*vals);grand=statistics.mean([v for vs in vals for v in vs])
   ssb=sum(len(v)*(statistics.mean(v)-grand)**2 for v in vals);sst=sum((v-grand)**2 for vs in vals for v in vs);eta=ssb/sst if sst else float('nan')
   lev=stats.levene(*vals)
   if lev.pvalue<.05:out['warnings'].append(f'Levene p={lev.pvalue:.4f}: varianzas heterogéneas; considera Kruskal-Wallis o Welch')
   out.update(statistic=float(r.statistic),p=float(r.pvalue),df=[k-1,n-k],n=n,effect={'name':'η²','value':eta,'magnitude':_magnitude('eta2',eta)},
    descriptives={kk:{'media':statistics.mean(v),'de':statistics.stdev(v),'n':len(v)} for kk,v in g.items()},assumptions=['Grupos independientes','Normalidad por grupo','Homogeneidad de varianzas (Levene p=%.4f)'%lev.pvalue])
  else:
   r=stats.kruskal(*vals);eps=(float(r.statistic)-k+1)/(n-k) if n>k else float('nan')
   out.update(statistic=float(r.statistic),p=float(r.pvalue),df=k-1,n=n,effect={'name':'ε²','value':eps,'magnitude':_magnitude('eta2',eps)},
    descriptives={kk:{'mediana':statistics.median(v),'n':len(v)} for kk,v in g.items()},assumptions=['Grupos independientes','Variable al menos ordinal'])
  if out['p']<alpha:out['warnings'].append('Resultado global significativo: identifica qué grupos difieren con comparaciones post hoc (Tukey o Dunn), no incluidas')
 elif test in {'pearson','spearman','regression'}:
  a,b=x(),y()
  if len(a)!=len(b):raise ValueError('X e Y deben tener el mismo tamaño')
  if len(a)<4:raise ValueError('Se requieren al menos cuatro pares')
  if len(set(a))<2 or len(set(b))<2:raise ValueError('Variable constante')
  if test=='pearson':
   r=stats.pearsonr(a,b,alternative=tails);out.update(statistic=float(r.statistic),p=float(r.pvalue),df=len(a)-2,n=len(a),effect={'name':'r (r² = %.3f)'%(r.statistic**2),'value':float(r.statistic),'magnitude':_magnitude('r',r.statistic)},assumptions=['Relación lineal','Normalidad bivariada aproximada','Sin valores atípicos influyentes'])
  elif test=='spearman':
   r=stats.spearmanr(a,b,alternative=tails);out.update(statistic=float(r.statistic),p=float(r.pvalue),n=len(a),effect={'name':'ρ de Spearman','value':float(r.statistic),'magnitude':_magnitude('r',r.statistic)},assumptions=['Relación monótona','Variables al menos ordinales'])
  else:
   r=stats.linregress(a,b);out.update(statistic=float(r.slope),p=float(r.pvalue),df=len(a)-2,n=len(a),effect={'name':'R²','value':float(r.rvalue**2),'magnitude':_magnitude('r',r.rvalue)},
    descriptives={'pendiente':float(r.slope),'intercepto':float(r.intercept),'ee_pendiente':float(r.stderr),'ecuacion':f'Y = {r.intercept:.4g} + {r.slope:.4g}·X'},
    assumptions=['Linealidad','Independencia de residuos','Homocedasticidad','Normalidad de residuos'])
   if tails!='two-sided':out['warnings'].append('La regresión reporta p bilateral')
 elif test=='chi2_ind':
  table=payload.get('table')
  if not isinstance(table,list) or len(table)<2 or any(not isinstance(r,list) or len(r)!=len(table[0]) for r in table) or len(table[0])<2:raise ValueError('Tabla de contingencia de al menos 2×2')
  t=[[int(c) for c in r] for r in table]
  if any(c<0 for r in t for c in r):raise ValueError('Frecuencias negativas')
  res=stats.chi2_contingency(t,correction=False);n=sum(map(sum,t));v=math.sqrt(float(res.statistic)/(n*(min(len(t),len(t[0]))-1)))
  low=int((res.expected_freq<5).sum())
  if low:out['warnings'].append(f'{low} celda(s) con frecuencia esperada < 5: la aproximación χ² no es fiable (usa Fisher en 2×2 o agrupa categorías)')
  out.update(statistic=float(res.statistic),p=float(res.pvalue),df=int(res.dof),n=n,effect={'name':'V de Cramér','value':v,'magnitude':_magnitude('r',v)},expected=res.expected_freq.tolist(),assumptions=['Observaciones independientes','Frecuencias esperadas ≥ 5'])
  out['alternative']='two-sided'
 elif test=='chi2_gof':
  obs=[int(v) for v in (payload.get('observed') or [])]
  if len(obs)<2 or any(v<0 for v in obs):raise ValueError('Frecuencias observadas de al menos dos categorías')
  n=sum(obs);exp=payload.get('expected')
  exp=[float(v) for v in exp] if exp else [n/len(obs)]*len(obs)
  if len(exp)!=len(obs) or any(v<=0 for v in exp):raise ValueError('Frecuencias esperadas inválidas')
  exp=[v*n/sum(exp) for v in exp]
  if any(v<5 for v in exp):out['warnings'].append('Frecuencias esperadas < 5: aproximación χ² poco fiable')
  r=stats.chisquare(obs,exp);w=math.sqrt(float(r.statistic)/n)
  out.update(statistic=float(r.statistic),p=float(r.pvalue),df=len(obs)-1,n=n,effect={'name':'w de Cohen','value':w,'magnitude':_magnitude('w',w)},expected=exp,assumptions=['Observaciones independientes','Frecuencias esperadas ≥ 5'])
  out['alternative']='two-sided'
 if not math.isfinite(out.get('statistic',float('nan'))) or not math.isfinite(out.get('p',float('nan'))):
  return {**out,'status':'invalid','reason':'Resultado no finito (datos constantes o varianza nula)','statistic':None,'p':None}
 e=out['effect'];e['value']=float(e['value']) if math.isfinite(e['value']) else None
 sig=out['p']<alpha
 out['status']='calculated'
 out['decision']='Se rechaza H0' if sig else 'No se rechaza H0'
 out['interpretation']=(f"{out['label']}: estadístico = {out['statistic']:.4f}"+(f", gl = {out['df']}" if 'df' in out else '')+f", p = {out['p']:.4g} (α = {alpha}). "
  +(f"Hay evidencia estadística contra H0" if sig else "No hay evidencia suficiente para rechazar H0")
  +(f"; tamaño del efecto {e['name']} = {e['value']:.3f} ({e['magnitude']})." if e['value'] is not None else '.')
  +" La significación no implica causalidad ni importancia práctica; revisa los supuestos.")
 return out

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
  elif payload.get('action')=='test':result=hypothesis_test(payload)
  else:result=pdf(payload) if payload.get('action')=='pdf' else quantitative(payload)
  print(json.dumps(result,ensure_ascii=False,allow_nan=False))
 except Exception as e:print(json.dumps({'error':str(e)}));sys.exit(1)
