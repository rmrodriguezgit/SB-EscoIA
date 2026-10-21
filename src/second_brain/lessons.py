"""Desarrollo didáctico con evidencia web y casos ejecutables de código controlado."""
import contextlib,html,io,json,re,urllib.parse,urllib.request
from .core import normal,identifier,now,atomic


def requested(question):
 q=normal(question)
 return (bool(re.search(r'\b(tema|subtema|marco teorico|caso practico|ipynb)\b',q)) or bool(re.search(r'\b(explica\w*|desarrolla\w*|ensena\w*)\b',q))) and not bool(re.search(r'\b(lista|listar|cuales|cuantos|objetivo|horas|creditos|semestre)\b',q))


def topic_query(question):
 q=re.sub(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]+\b','',question,flags=re.I)
 explicit=re.search(r'(?i)\b(?:sub)?tema\s+(?:(?:de|del|sobre)\s+)?(.+)',q)
 if explicit:q=explicit[1]
 else:q=re.sub(r'(?i)^\s*(?:desarrolla|explica|elabora|genera|quiero|crea)\s+','',q)
 q=re.split(r'(?i)\b(?:haz|hacer|elabora|genera|entrega|incluye|prepara|marco\s+te[oó]rico|ejemplos|pr[aá]cticas|ipynb)\b|\s+con\s+(?:caso|marco|ejemplo|pr[aá]ctica)',q,maxsplit=1)[0]
 q=' '.join(q.split()).strip(' ,:.-')
 q=re.sub(r'(?i)^(?:(?:de|del|sobre|el|la|un|una)\s+)+','',q)
 q=re.sub(r'(?i)(?:\s+(?:con|de|del|por favor))+$','',q)
 return q[:240]


def web_sources(topic):
 """Solo se transmite el tema, nunca la memoria ni documentos privados."""
 if 'analisis de datos' in normal(topic):
  from html.parser import HTMLParser
  class Text(HTMLParser):
   def __init__(self):super().__init__();self.parts=[];self.skip=0
   def handle_starttag(self,tag,attrs):
    if tag in {'script','style'}:self.skip+=1
   def handle_endtag(self,tag):
    if tag in {'script','style'}:self.skip=max(0,self.skip-1)
   def handle_data(self,data):
    if not self.skip:self.parts.append(data)
  pages=[('NIST/SEMATECH. (s. f.). What is EDA? e-Handbook of Statistical Methods.','https://www.itl.nist.gov/div898/handbook/eda/section1/eda11.htm'),('Python Software Foundation. (s. f.). statistics — Mathematical statistics functions.','https://docs.python.org/3/library/statistics.html')]
  result=[]
  for title,url in pages:
   try:
    req=urllib.request.Request(url,headers={'User-Agent':'EscoIA/0.3'})
    with urllib.request.urlopen(req,timeout=15) as r:
     raw=r.read(1_000_001)
     if len(raw)>1_000_000:raise ValueError('Página demasiado grande')
    parser=Text();parser.feed(raw.decode('utf-8',errors='replace'));text=' '.join(' '.join(parser.parts).split())
    result.append({'id':url,'kind':'web','citation':title+' '+url,'url':url,'text':text[:4000],'access':'Página oficial recuperada; contenido docente elaborado a partir de fundamentos y prácticas controladas','retrieved_at':now()})
   except (OSError,ValueError):continue
  return result
 query=urllib.parse.urlencode({'query.bibliographic':topic,'rows':8})
 request=urllib.request.Request('https://api.crossref.org/works?'+query,headers={'User-Agent':'EscoIA/0.3 (local academic research)','Accept':'application/json'})
 with urllib.request.urlopen(request,timeout=25) as response:
  raw=response.read(2_000_001)
  if len(raw)>2_000_000:raise ValueError('Respuesta bibliográfica demasiado grande')
  works=json.loads(raw)['message']['items']
 sources=[];terms={t for t in re.findall(r'\w+',normal(topic)) if len(t)>3}
 for work in works:
  title=(work.get('title') or [''])[0];abstract=' '.join(re.sub('<[^>]+>',' ',html.unescape(work.get('abstract',''))).split())
  doi=work.get('DOI','')
  overlap=terms & set(re.findall(r'\w+',normal(title+' '+abstract)))
  if not doi or not title or not abstract or len(overlap)<max(1,min(len(terms),2)) or len(overlap)/max(1,len(terms))<0.67:continue
  authors='; '.join(n for a in work.get('author',[])[:4] if (n:=(', '.join(filter(None,[a.get('family'),a.get('given')])) or a.get('name','')))) or 'Autor no disponible'
  year=str((work.get('issued',{}).get('date-parts') or [[None]])[0][0] or 's. f.')
  link='https://doi.org/'+urllib.parse.quote(doi,safe='/')
  citation=f'{authors} ({year}). {title}. '+(work.get('container-title') or [''])[0]+'. '+link
  sources.append({'id':'doi:'+doi,'kind':'web','citation':citation,'url':link,'text':title+'\n'+abstract[:2600],'access':'Resumen depositado en Crossref; texto completo no revisado','retrieved_at':now()})
  if len(sources)==3:break
 return sources


def notebook(topic,references):
 q=normal(topic)
 if 'analisis de datos' in q:
  from .data_lesson import build
  return build(topic,references)
 if any(k in q for k in ['valor presente','van','vpn','flujo de efectivo','evaluacion financiera','proyectos de inversion']):
  formula=r'$$VPN=-I_0+\sum_{t=1}^{n}\frac{F_t}{(1+r)^t}$$'
  code='inversion = 10000\nflujos = [3500, 4000, 4500]\ntasa = 0.10\nvpn = -inversion + sum(f / (1 + tasa)**t for t, f in enumerate(flujos, 1))\nprint(f"VPN a tasa {tasa:.0%}: {vpn:.2f}")\nfor r in [0.05, 0.10, 0.20]:\n    v = -inversion + sum(f / (1 + r)**t for t, f in enumerate(flujos, 1))\n    print(f"Tasa {r:.0%}: VPN = {v:.2f}")\n'
  interpretation='El VPN descuenta los flujos al momento inicial. Un VPN positivo supera la rentabilidad exigida en este escenario; uno negativo no la alcanza. Compara tasas y explica la sensibilidad. No incorpora impuestos, inflación ni riesgo: no constituye una recomendación de inversión.'
 elif any(k in q for k in ['punto de equilibrio','costo volumen','costos volumen']):
  formula=r'$$Q^*=\frac{CF}{P-CV_u},\quad P>CV_u$$'
  code='costo_fijo = 12000\nprecio = 150\ncosto_variable = 90\nassert precio > costo_variable\nequilibrio = costo_fijo / (precio - costo_variable)\nprint(f"Punto de equilibrio: {equilibrio:.2f} unidades")\nfor unidades in [100, 200, 300]:\n    utilidad = unidades * (precio - costo_variable) - costo_fijo\n    print(f"Unidades {unidades}: utilidad {utilidad:.2f}")\n'
  interpretation='En el punto de equilibrio los ingresos igualan los costos totales. Por debajo hay pérdida y por encima utilidad dentro del modelo lineal. Se suponen precio y costo variable constantes y venta de toda la producción.'
 elif any(k in q for k in ['estadistica descriptiva','media aritmetica','distribucion de frecuencias','medidas de tendencia','analisis de encuestas']):
  formula=r'$$\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i,\qquad s^2=\frac{\sum_{i=1}^{n}(x_i-\bar{x})^2}{n-1}$$'
  code='from statistics import mean, median, stdev\nfrom collections import Counter\nrespuestas = [2, 3, 3, 4, 4, 4, 5, 5, 3, 4]\nprint("Frecuencias:", dict(sorted(Counter(respuestas).items())))\nprint(f"Media: {mean(respuestas):.2f}; mediana: {median(respuestas):.2f}; desviación muestral: {stdev(respuestas):.2f}")\n'
  interpretation='La mediana describe la categoría central y las frecuencias muestran la distribución. La media de una escala ordinal presupone distancias comparables entre categorías; examina esa hipótesis. Esta muestra simulada no permite inferencias sobre una población.'
 else:return None
 output=io.StringIO()
 # Solo ejecuta nuestras plantillas de código; jamás código de Qwen, web o repositorios.
 with contextlib.redirect_stdout(output):exec(compile(code,'caso_controlado.py','exec'),{})
 def md(text):return {'cell_type':'markdown','metadata':{},'source':text.splitlines(True)}
 cells=[md('# Caso práctico: '+topic+'\n\n## Objetivo\nAplicar el modelo, interpretar resultados y analizar sus supuestos.\n\n**Datos simulados para docencia; no son datos institucionales.**'),md('## Modelo teórico\n'+formula+'\n\nIdentifica cada variable y sus unidades. Una variable se escribe como $x$ y una ecuación centrada usa `$$...$$`.'),{'cell_type':'code','metadata':{},'execution_count':1,'source':code.splitlines(True),'outputs':[{'output_type':'stream','name':'stdout','text':output.getvalue().splitlines(True)}]},md('## Explicación de resultados\n'+interpretation+'\n\n## Actividad de cierre\n1. Modifica un parámetro, predice el efecto y ejecuta todas las celdas.\n2. Contrasta el resultado con tu predicción.\n3. Explica dos limitaciones y una aplicación a una situación real.\n4. Entrega una conclusión con fórmula, unidades y evidencia del resultado.'),md('## Fuentes y procedencia\nCódigo original de EscoIA, sin dependencias externas. No se ejecutó código de repositorios.\n\n'+'\n\n'.join(s['citation']+'\nAlcance: '+s.get('access','Plan de estudios local') for s in references))]
 return {'nbformat':4,'nbformat_minor':5,'metadata':{'kernelspec':{'display_name':'Python 3','language':'python','name':'python3'},'language_info':{'name':'python','version':'3.11'}},'cells':[dict(c,id=identifier()[:8]) for c in cells]},output.getvalue(),interpretation


def case_framework(topic,nb,interpretation,source_index):
 q=normal(topic)
 if 'VPN=' in ''.join(nb['cells'][1]['source']):
  definition='El valor presente neto (VPN) expresa el valor actual de los flujos netos futuros menos la inversión inicial. Los flujos se descuentan con una tasa consistente con su período. La inversión inicial es una salida de recursos y entra con signo negativo.'
  variables='En la fórmula, $I_0$ es la inversión inicial, $F_t$ el flujo neto del período $t$, $r$ la tasa por período y $n$ el número de períodos. Flujos e inversión deben usar unidades monetarias comparables. La tasa modifica el resultado: no es independiente de ella.'
 elif 'Q^*' in ''.join(nb['cells'][1]['source']):
  definition='El punto de equilibrio es la cantidad de unidades para la cual ingresos y costos totales son iguales. En el modelo lineal, ingresos = precio por cantidad; costos totales = costo fijo más costo variable unitario por cantidad.'
  variables='El margen de contribución unitario es $P-CV_u$. Dividir el costo fijo $CF$ entre ese margen da $Q^*$. Se requiere un margen positivo; si no lo hay, vender más no cubre el costo fijo bajo estos supuestos.'
 else:
  definition='La estadística descriptiva organiza y resume los datos observados. Las frecuencias muestran cuántas respuestas pertenecen a cada categoría, la mediana indica el centro ordenado y la media resume valores cuando tiene sentido promediarlos.'
  variables='La media suma los valores y divide entre el número de observaciones $n$. La varianza muestral usa el divisor $n-1$; la desviación estándar es su raíz cuadrada. Ninguna de estas medidas por sí sola acredita causalidad ni representatividad.'
 formula=''.join(nb['cells'][1]['source']).split('\n\nIdentifica')[0].replace('## Modelo teórico\n','')
 return definition+'\n\n'+formula+'\n\n'+variables+'\n\n'+interpretation+f' [{source_index}]'

def create(brain,question,career,run):
 from . import finance_lesson
 if finance_lesson.requested(question):return finance_lesson.create(brain,question,run)
 from .knowledge import curriculum_evidence
 from .runtime import infer,ollama,assert_resources
 from .adapters import validate_answer
 topic=topic_query(question)
 retrieved=curriculum_evidence(brain,question,career)
 local=[s for s in retrieved['sources'] if s.get('kind')=='document' or s.get('document_id')][:2]
 numbered=re.search(r'(?i)(?:sub)?tema\s+(\d+(?:\.\d+)*)(?=\s|$)',question)
 if numbered:
  records=retrieved.get('records',[])
  if len(records)!=1:raise ValueError('Indica la clave de la asignatura para localizar el tema numerado')
  units=(records[0].get('programa_asignatura') or {}).get('unidades',[])
  matches=[t['texto'] for u in units for t in u.get('temas_y_subtemas',[]) if t.get('numero')==numbered[1]]
  if not matches and numbered[1].isdigit() and 1<=int(numbered[1])<=len(units):matches=[units[int(numbered[1])-1]['titulo']]
  if len(matches)!=1:raise ValueError('No encontré ese tema exacto en el programa; indica su número o nombre completo')
  topic=matches[0]
 if len(topic)<4:raise ValueError('Indica un tema específico y, si puedes, la clave de la asignatura')
 brain.event(run,'Investigación','Consultando referencias académicas y resúmenes públicos; se envía únicamente el tema')
 note=''
 try:web=web_sources(topic)
 except Exception as e:web=[];note='Consulta web no completada: '+str(e)
 evidence=local+web
 case=notebook(topic,evidence)
 if case:
  nb,results,interpretation=case
  formula=''.join(nb['cells'][1]['source'])
  evidence.append({'id':'case:'+run,'kind':'calculation','citation':'EscoIA. Caso didáctico original, código controlado y datos simulados, ejecutado con Python.','text':formula+'\n'+interpretation+'\n'+results})
 if not web:note=note or 'No se recuperaron fuentes públicas pertinentes disponibles; no se inventaron referencias ni se afirmó una consulta web exitosa.'
 validation={'status':'not_run','passed':False};theory=''
 if web:
  try:
   assert_resources();brain.event(run,'Qwen','Elaborando marco teórico a partir del contenido recuperado')
   theory=infer('Elabora en español un marco teórico de '+topic+'. Explica conceptos y relaciones en cuatro párrafos con citas [n]. Usa solo contenido disponible, sin atribuir resultados al texto completo no leído. Usa correctamente VPN (valor presente neto), si aplica; los beneficios descontados menos los costos descontados, incluyendo inversión inicial, determinan su valor. EscoIA es el software, nunca atribuyas un curso a una universidad llamada EscoIA. No nombres fuentes irrelevantes. No agregues supuestos ni resultados que no estén en la evidencia.',evidence)
   ollama('/api/generate',{'model':__import__('os').environ.get('BRAIN_MODEL','qwen2.5:3b-instruct-q4_K_M'),'keep_alive':0},timeout=15)
   import time
   deadline=time.monotonic()+45
   while ollama('/api/ps',timeout=3).get('models'):
    if time.monotonic()>deadline:raise RuntimeError('Qwen no liberó memoria para Laya')
    time.sleep(.2)
   brain.event(run,'Laya','Contrastando el marco teórico con las fuentes recuperadas')
   validation=validate_answer(brain.home,theory,evidence)
   if 'valor presente' in normal(topic) and (re.search(r'\bVNP\b',theory) or re.search(r'rest[a-z]*.{0,45}beneficios',normal(theory))):
    validation={'status':'rejected_by_rules','passed':False,'reason':'Definición o nomenclatura financiera inconsistente'}
   if not validation.get('passed'):theory='';note='El borrador no superó la revisión; se muestran fuentes recuperadas para revisión docente.'
  except Exception as e:theory='';note='Marco teórico pendiente: '+str(e)
 if case and 'analisis de datos' in normal(topic):
  from .data_lesson import THEORY
  theory=THEORY
  validation={'status':'deterministic_case_verified','passed':False,'model_review':validation,'reason':'Prácticas ejecutadas y fundamentos docentes documentados; revisión del modelo registrada por separado.'}
 elif case:
  theory=case_framework(topic,case[0],case[2],len(evidence))
  if web:
   theory+='\n\nLecturas académicas consultadas — extractos de los resúmenes, sin atribuirles el caso simulado:\n'+ '\n\n'.join(f'[{len(local)+i+1}] «'+s['text'][:420]+'…»' for i,s in enumerate(web))
  else:theory+='\n\n'+note
  validation={'status':'deterministic_case_verified','passed':False,'model_review':validation,'reason':'Fundamentos y resultados del caso comprobados mediante fórmulas y código controlado; el dictamen de Laya corresponde al borrador, no certifica el texto final.'}
 if not theory:theory='No se presenta una síntesis como validada. '+note+'\n\n'+ '\n\n'.join(f'[{i+1}] {s["citation"]}\nAlcance: {s.get("access","Programa curricular local")}' for i,s in enumerate(evidence))
 brain.event(run,'Didáctica','Preparando secuencia de enseñanza-aprendizaje y actividad de cierre')
 pedagogy=f'''Desarrollo académico — propuesta para revisión docente\nObjetivo: explicar {topic}, aplicarlo a una situación pertinente y justificar conclusiones con evidencia.\nInicio (10 min): recuperar conocimientos previos y formular una pregunta problema; registrar la respuesta inicial.\nDesarrollo (25 min): identificar conceptos en las fuentes, construir un mapa de relaciones y resolver un ejemplo guiado. Distinguir definiciones, supuestos y resultados.\nPráctica (20 min): trabajar en parejas; documentar procedimiento, decisiones y límites del modelo o argumento.\nEvaluación formativa: verificar exactitud conceptual, coherencia del procedimiento, interpretación y uso de fuentes. Retroalimentar y corregir antes de entregar.\nActividad de cierre (10 min): comparar la respuesta inicial con la final, explicar qué cambió y resolver una pregunta de transferencia. Entregar una conclusión y una duda pendiente.'''
 artifacts=[];practical='Este tema no tiene una plantilla computacional pertinente implementada. Caso cualitativo: analiza una situación relacionada con el tema, identifica actores, contrasta dos alternativas con las fuentes y justifica una decisión; no se genera un notebook de relleno.'
 if case:
  brain.event(run,'Notebook','Ejecutando y comprobando el caso práctico de código controlado')
  nb,results,interpretation=case
  nb['cells'].append({'id':identifier()[:8],'cell_type':'markdown','metadata':{},'source':(('## Secuencia de enseñanza-aprendizaje\n\n'+pedagogy) if 'analisis de datos' in normal(topic) else ('## Marco teórico y secuencia de aprendizaje\n\n'+theory+'\n\n'+pedagogy)).splitlines(True)})
  eid=identifier();folder=brain.home/'data/exports'/eid;folder.mkdir(parents=True,exist_ok=True)
  filename='Analisis-de-datos.ipynb' if 'analisis de datos' in normal(topic) else 'Caso-practico.ipynb'
  atomic(folder/filename,json.dumps(nb,ensure_ascii=False,indent=2));atomic(folder/'plan.json',json.dumps({'id':eid,'code':'tema','created':now(),'files':{'ipynb':filename},'topic':topic,'sources':evidence},ensure_ascii=False))
  artifacts=[{'format':'ipynb','label':'Notebook ejecutable','url':f'/api/export?id={eid}&format=ipynb'}]
  practical='Caso práctico con datos simulados — notebook ejecutado con Python, sin paquetes adicionales.\n\nResultados:\n'+results+'\nExplicación:\n'+interpretation
 brain.event(run,'completada','Material didáctico '+('con fundamentos matemáticos comprobados' if case else 'con marco teórico revisado' if validation.get('passed') else 'con marco teórico pendiente de revisión')+(' y notebook ejecutado' if case else '') )
 summary=f'{topic.capitalize()}: material preparado con marco teórico, ejemplos, prácticas y actividad de cierre.'
 if case:summary+=' Descarga el notebook; incluye fórmulas LaTeX, código y resultados ejecutados con datos simulados.'
 else:summary+=' '+practical
 if note:summary+='\n'+('Revisión adicional del modelo pendiente; el notebook y sus cálculos están disponibles.' if case and note.startswith('Marco teórico pendiente:') else note)
 return {'text':summary,'sources':[],'references':evidence,'artifacts':artifacts,'validation':validation,'run_id':run,'mode':'Material académico · notebook ejecutado' if case else 'Desarrollo académico · Qwen + fuentes web','notice':note}
