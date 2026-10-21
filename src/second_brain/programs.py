"""Planeación basada en temario y exportación con la plantilla aportada."""
import copy,hashlib,json,os,re,shutil,subprocess,tempfile,zipfile
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET
from .core import identifier,normal,now,atomic
from .academic_json import academic_evidence,sections
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS={'w':W}
def tag(name):return '{'+W+'}'+name

def requested(question):
 q=normal(question)
 planning=bool(re.search(r'\b(planeacion|planificacion|programacion)\b',q))
 explicit=bool(re.search(r'\b(crea\w*|genera\w*|elabora\w*|haz|hacer|prepara\w*)\b',q) and re.search(r'\b(programa|planeacion|planificacion|programacion)\b',q))
 academic=bool(re.search(r'\b(?:lar|lan|lcp|lni|lnv|lth)[a-z0-9]{3,}\b',q))
 return explicit or (planning and academic and bool(re.search(r'\b(semestre|semanas|materia|curso)\b',q)))

def prepare(brain,question,career='',metadata=None):
 from .program_metadata import extract
 metadata=extract(question,metadata);retrieved=academic_evidence(brain,question,career)
 if not retrieved or len(retrieved.get('records',[]))!=1:raise ValueError('Indica una clave única, por ejemplo: Crea un programa de LAN864')
 r=retrieved['records'][0]
 if not re.fullmatch(r'(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}',r['clave']):raise ValueError('Clave de asignatura inválida para exportación')
 program=r.get('programa_asignatura')
 if not program or not program.get('contenido_tematico'):raise ValueError('Falta el programa de asignatura en los PDF: no generaré un temario inventado')
 teaching_weeks=[1,2,3,4,5,7,8,9,10,11,13,14,15,16]
 units=program.get('unidades') or []
 # Fragmentos de tema, sin perder subtemas ni asignarlos dos veces.
 items=[]
 for unit in units:
  for topic in unit['temas_y_subtemas']:items.append({'unidad':unit['numero']+' '+unit['titulo'],'numero':topic['numero'],'texto':topic['texto']})
 if not items:items=[{'unidad':'Contenido temático','numero':'','texto':line} for line in program['contenido_tematico'].splitlines() if line.strip()]
 assignments={week:[] for week in teaching_weeks}
 for i,week in enumerate(teaching_weeks):
  start=i*len(items)//len(teaching_weeks);end=max(start+1,(i+1)*len(items)//len(teaching_weeks))
  assignments[week]=items[start:end]
 # Cuando hay menos temas que semanas, se trabajan en varias sesiones; no se inventan temas.
 plan={'id':identifier(),'created':now(),'code':r['clave'],'name':r['nombre'],'career':career or r['clave'][:3],'semester':r['semestre'],'teacher':str(metadata.get('teacher','Por completar'))[:150],'group':str(metadata.get('group','Por completar'))[:100],'shift':metadata['shift'],'modality':str(metadata.get('modality','Presencial'))[:100],'calendar_note':metadata['calendar_note'],'period':str(metadata.get('period','Por completar'))[:150],'dates':str(metadata.get('dates','Por completar'))[:150],'objective':program.get('objetivo') or 'Por completar por el docente','units':units,'academic_activities':program.get('actividades_academico') or 'Por completar por el docente','homework':program.get('actividades_independientes') or 'Por completar por el docente','source_evaluation':program.get('evaluacion') or '', 'source_pdf':r.get('fuente_pdf'),'sources':retrieved['sources'],'weights':[20,20,60],'weeks':[],'observations':r.get('observaciones',[]),'references':[], 'reference_note':'Completar referencias bibliográficas verificadas por el docente; no se inventaron fuentes.'}
 # Bibliografía específica; nunca heredar libros de otra materia.
 from .program_references import select
 plan['references'],plan['reference_note']=select(brain,r)
 if metadata.get('group_semester') and metadata['group_semester']!=r['semestre']:
  plan['observations'].append({'tipo':'grupo_semestre','detalle':'El semestre inferido del grupo no coincide con el mapa de la asignatura; revisar adscripción.'})
 for week in range(1,18):
  exam={6:'Primer parcial — 20%',12:'Segundo parcial — 20%',17:'Evaluación final — 60%'}.get(week)
  plan['weeks'].append({'week':week,'kind':'exam' if exam else 'teaching','topics':assignments.get(week,[]),'dates':metadata['weekly_dates'].get(week,'Por completar'),'assessment':exam or 'Evidencia de aprendizaje y retroalimentación','period':1 if week<=6 else 2 if week<=12 else 3})
 if [w['week'] for w in plan['weeks']]!=list(range(1,18)) or any(not w['topics'] for w in plan['weeks'] if w['kind']=='teaching'):
  raise ValueError('La planificación no cubre todas las semanas lectivas; revisa el temario fuente')
 expected={(i['unidad'],i['numero'],i['texto']) for i in items}
 actual={(i['unidad'],i['numero'],i['texto']) for w in plan['weeks'] for i in w['topics']}
 if actual!=expected:raise ValueError('La planificación perdió contenido del programa fuente')
 return plan

def replace_paragraph(paragraph,text):
 ppr=copy.deepcopy(paragraph.find(tag('pPr')))
 oldrun=paragraph.find(tag('r'));rpr=copy.deepcopy(oldrun.find(tag('rPr'))) if oldrun is not None else None
 for child in list(paragraph):paragraph.remove(child)
 if ppr is not None:paragraph.append(ppr)
 run=ET.SubElement(paragraph,tag('r'))
 if rpr is not None:run.append(rpr)
 for i,line in enumerate(str(text).split('\n')):
  if i:ET.SubElement(run,tag('br'))
  node=ET.SubElement(run,tag('t'));node.set('{http://www.w3.org/XML/1998/namespace}space','preserve');node.text=line

def replace_cell(cell,text):
 original=cell.find(tag('p'));proto=copy.deepcopy(original) if original is not None else ET.Element(tag('p'))
 for child in list(cell):
  if child.tag!=tag('tcPr'):cell.remove(child)
 for line in str(text).split('\n'):
  p=copy.deepcopy(proto);replace_paragraph(p,line);cell.append(p)

def write_docx(template,target,plan):
 with zipfile.ZipFile(template) as source:
  root=ET.fromstring(source.read('word/document.xml'));body=root.find('w:body',NS)
  paragraphs=body.findall('w:p',NS);tables=body.findall('w:tbl',NS)
  if len(tables)!=13 or len(paragraphs)<101:raise ValueError('La plantilla cambió; requiere revisar sus campos')
  # La tabla final de la muestra desborda con una tercera columna vacía.
  old=tables[12];replacement=copy.deepcopy(tables[8]);idx=list(body).index(old);body.remove(old);body.insert(idx,replacement);tables[12]=replacement
  replacements={4:f"Programa Académico: {plan['code']}\t\tGrupo: {plan['group']} — Turno: {plan['shift']}",5:f"Materia: {plan['name'].upper()}\nPeríodo: {plan['period']}",6:f"Maestro: {plan['teacher']}\nFechas en que se cursará: {plan['dates']}",7:'Modalidad: '+plan['modality'],10:' '.join(plan['objective'].split()),15:'Enfoque y relación con el plan de estudios:\n'+f"Asignatura del semestre {plan['semester']} de {plan['career']}. Planeación propuesta a partir del temario aportado.",25:'Materias a las que apoya el curso: por completar; seriación no confirmada.',32:'Primer Periodo — semanas 1 a 6 — parcial 20%',42:'Segundo Periodo — semanas 7 a 12 — parcial 20%',53:'Tercer Periodo — semanas 13 a 16 — final en semana 17 (60%)',60:'\n'.join(plan['references']) if plan['references'] else 'Referencias por completar por el docente.',62:plan['reference_note'],76:'Bibliografía complementaria:\nPor completar por el docente.',86:'Observaciones, aciertos, deficiencias y sugerencias:\nPlaneación propuesta. '+plan['calendar_note']+' Horarios y normas de entrega deben confirmarse con la institución.\n'+ '\n'.join(json.dumps(o,ensure_ascii=False) for o in plan['observations']),100:plan['teacher']}
  for index,text in replacements.items():replace_paragraph(paragraphs[index],text)
  cells=lambda t:tables[t].find('w:tr',NS).findall('w:tc',NS)
  replace_cell(cells(0)[0],'Políticas del curso:\nHorario: por completar.\nAplicar el reglamento institucional vigente; las políticas de la muestra no se trasladan automáticamente a este curso.')
  replace_cell(cells(0)[1],'Normas para la entrega de trabajos:\nPlataforma, fechas y criterios de recepción: por completar por el docente.')
  for period in range(1,4):
   def date_label(value):
    parts=value.split('–')
    return parts[0][:5]+'–'+parts[1][:5] if len(parts)==2 and parts[0][-4:]==parts[1][-4:] else value
   t=1+(period-1)*4;weeks=[w for w in plan['weeks'] if w['period']==period]
   lines=['Contenido temático: temas y subtemas']
   for week in weeks:
    lines.append('Semana '+str(week['week'])+(' — '+week['assessment'] if week['kind']=='exam' else ''))
    lastunit=None
    for topic in week['topics']:
     if topic['unidad']!=lastunit:lines.append(topic['unidad']);lastunit=topic['unidad']
     lines.append((topic['numero']+' '+topic['texto']).strip())
   replace_cell(cells(t)[0],'\n'.join(lines));replace_cell(cells(t)[1],'Fechas propuestas '+(plan['dates'][-4:] if plan['dates']!='Por completar' else '')+':\n'+ '\n'.join('Semana '+str(w['week'])+'\n'+date_label(w['dates']) for w in weeks))
   replace_cell(cells(t+1)[0],'Actividades de aprendizaje en clase:\n'+plan['academic_activities'])
   replace_cell(cells(t+1)[1],'Material de apoyo:\nSeleccionar materiales y herramientas disponibles para el curso.')
   replace_cell(cells(t+1)[2],'Fechas propuestas:\n'+date_label(weeks[0]['dates'])+'\na\n'+date_label(weeks[-1]['dates']))
   replace_cell(cells(t+2)[0],'Actividades de aprendizaje extra-clase:\n'+plan['homework'])
   replace_cell(cells(t+2)[1],'Fecha de entrega:\nPor completar para cada actividad.')
   replace_cell(cells(t+3)[0],f"Evaluación {'final' if period==3 else 'parcial'}:\nPonderación del periodo en la nota final: {plan['weights'][period-1]}%.\nCriterios del programa fuente, para revisión docente:\n"+plan['source_evaluation'])
   replace_cell(cells(t+3)[-1],'Fecha propuesta de examen:\nSemana '+str([6,12,17][period-1])+'\n'+date_label(plan['weeks'][[6,12,17][period-1]-1]['dates'])+'\nConfirmar día institucional.')
  # Evitar altura fija y relleno vacío de la muestra; no cambiar fuentes ni columnas.
  for height in root.findall('.//w:trHeight',NS):
   for parent in root.iter():
    if height in list(parent):parent.remove(height);break
  for p in list(body.findall('w:p',NS)):
   text=''.join(t.text or '' for t in p.findall('.//w:t',NS))
   if not text.strip() and not p.findall('.//w:drawing',NS) and not p.findall('.//w:sectPr',NS):body.remove(p)
  for p in root.findall('.//w:p',NS):
   ppr=p.find(tag('pPr'))
   if ppr is not None:
    for child in list(ppr):
     if child.tag in {tag('pageBreakBefore'),tag('keepNext'),tag('keepLines')}:ppr.remove(child)
  normalize_layout(root)
  data=ET.tostring(root,encoding='utf-8',xml_declaration=True)
  with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as out:
   for entry in source.infolist():out.writestr(entry,data if entry.filename=='word/document.xml' else source.read(entry.filename))

def normalize_layout(root):
 body=root.find('w:body',NS)
 for p in body.findall('.//w:p',NS):
  text=''.join(t.text or '' for t in p.findall('.//w:t',NS)).strip()
  ppr=p.find(tag('pPr'))
  if ppr is None:ppr=ET.SubElement(p,tag('pPr'))
  for child in list(ppr):
   if child.tag in {tag('jc'),tag('spacing'),tag('framePr')}:ppr.remove(child)
  ET.SubElement(ppr,tag('jc')).set(tag('val'),'left')
  ET.SubElement(ppr,tag('spacing'),{tag('before'):'0',tag('after'):'70',tag('line'):'240',tag('lineRule'):'auto'})
  size=28 if 'instrumento de planeaci' in normal(text) else 26 if re.match(r'^(Primer|Segundo|Tercer) Periodo',text) else 22
  if size==28:
   for child in list(ppr):
    if child.tag==tag('pBdr'):ppr.remove(child)
  for run in p.findall('.//w:r',NS):
   rpr=run.find(tag('rPr'))
   if rpr is None:rpr=ET.SubElement(run,tag('rPr'))
   for child in list(rpr):
    if child.tag in {tag('sz'),tag('szCs'),tag('rFonts'),tag('color')}:rpr.remove(child)
   ET.SubElement(rpr,tag('rFonts'),{tag('ascii'):'Arial',tag('hAnsi'):'Arial'})
   ET.SubElement(rpr,tag('sz')).set(tag('val'),str(size));ET.SubElement(rpr,tag('szCs')).set(tag('val'),str(size))
   ET.SubElement(rpr,tag('color')).set(tag('val'),'000000')
 for node in body.findall('.//w:sz',NS)+body.findall('.//w:szCs',NS):
  if int(node.get(tag('val'),'22'))>28:node.set(tag('val'),'22')
 for i,table in enumerate(body.findall('w:tbl',NS)):
  if i not in {1,5,9}:
   for row in table.findall('w:tr',NS):
    prop=row.find(tag('trPr'))
    if prop is None:prop=ET.SubElement(row,tag('trPr'))
    ET.SubElement(prop,tag('cantSplit'))
  for cell in table.findall('.//w:tc',NS):
   prop=cell.find(tag('tcPr'))
   if prop is None:prop=ET.SubElement(cell,tag('tcPr'))
   margin=prop.find(tag('tcMar'))
   if margin is None:margin=ET.SubElement(prop,tag('tcMar'))
   for side in ['top','left','bottom','right']:
    el=margin.find(tag(side))
    if el is None:el=ET.SubElement(margin,tag(side))
    el.set(tag('w'),'80');el.set(tag('type'),'dxa')
   for p in cell.findall('w:p',NS):
    ppr=p.find(tag('pPr'));ET.SubElement(ppr,tag('keepLines'))
    for size in p.findall('.//w:sz',NS)+p.findall('.//w:szCs',NS):size.set(tag('val'),'21')

EXPORT_LOCK=__import__('threading').Lock()
def create(brain,question,career='',metadata=None,run_id=None):
 from .runtime import assert_resources
 from .core import CAREERS
 with EXPORT_LOCK:
  from . import remote_ai
  # La exportación está serializada; no carga ningún modelo en el Mac.
  if not remote_ai.enabled():assert_resources(reserve_gib=.8)
  plan=prepare(brain,question,career,metadata)
  if run_id:plan['id']=run_id
  template=brain.home/'config/templates/planeacion-curso.docx'
  config=brain.home/'config/export_runtime.json'
  setup=json.loads(config.read_text()) if config.exists() else {}
  soffice=os.environ.get('ESCOIA_SOFFICE') or setup.get('soffice') or shutil.which('soffice')
  if not soffice or not Path(soffice).is_file():raise RuntimeError('Falta LibreOffice para exportar PDF y DOC; configura ESCOIA_SOFFICE')
  folder=brain.home/'data/exports'/plan['id'];folder.mkdir(parents=True,mode=0o700)
  atomic(folder/'plan.json',json.dumps(plan,ensure_ascii=False,indent=2))
  filename='Programa-'+plan['code'];docx=folder/(filename+'.docx');write_docx(template,docx,plan)
  brain.event(plan['id'],'Planeación','Distribución del temario en 16 semanas y examen final en semana 17')
  brain.event(plan['id'],'Archivos','Generando PDF y Word con el formato de la muestra')
  env=dict(os.environ,TMPDIR='/private/tmp',TEMP='/private/tmp',TMP='/private/tmp')
  with tempfile.TemporaryDirectory(prefix='escoia-export-',dir='/private/tmp') as tmp:
   profile=Path(tmp)/'profile'
   for fmt in ['pdf','doc:MS Word 97']:
    result=subprocess.run([soffice,'-env:UserInstallation='+profile.as_uri(),'--headless','--convert-to',fmt,'--outdir',str(folder),str(docx)],capture_output=True,text=True,timeout=90,env=env)
    suffix='pdf' if fmt=='pdf' else 'doc';file=folder/(filename+'.'+suffix)
    if result.returncode or not file.exists():raise RuntimeError('No se pudo exportar '+suffix+': '+result.stderr[-300:])
  for file in folder.iterdir():os.chmod(file,0o600)
  brain.event(plan['id'],'completada','Programa descargable PDF y Word listo')
  source=plan.get('source_pdf') or {};text=f"Programa de {plan['code']} — {plan['name']}\n16 semanas de planeación, parciales en semanas 6 y 12 y evaluación final en semana 17. Ponderación 20% / 20% / 60%.\nFormato basado en la muestra aportada. Completa docente, grupo, calendario, normas y referencias antes de aprobarlo."
  text=f"Planificación de {plan['code']} — {plan['name']}. Período: {plan['period']}. Grupo: {plan['group']}; turno: {plan['shift']}; docente: {plan['teacher']}. Incluye la programación de las semanas 1–16 y el examen final en la semana 17. Descarga Word o PDF con temario, actividades, evaluaciones y bibliografía. Fechas propuestas sujetas al calendario institucional."
  return {'text':text,'mode':'Programa de curso · PDF y Word','sources':plan['sources'],'references':plan['sources'],'run_id':plan['id'],'validation':{'status':'program_verified','passed':True,'reason':'Cobertura de semanas y temario fuente comprobada por reglas deterministas; propuesta para revisión docente, sin certificación del modelo'},'artifacts':[{'label':'Descargar PDF','format':'pdf','url':f'/api/export?id={plan["id"]}&format=pdf'},{'label':'Descargar Word (.doc)','format':'doc','url':f'/api/export?id={plan["id"]}&format=doc'},{'label':'Word editable (.docx)','format':'docx','url':f'/api/export?id={plan["id"]}&format=docx'}]}

def copy_text(plan):
 lines=['Instrumento de Planeación para un Curso',f"Programa académico: {plan['code']}",f"Materia: {plan['name']}",f"Docente: {plan['teacher']}",f"Grupo: {plan['group']} — Turno: {plan['shift']}",'Objetivo general: '+plan['objective'],'']
 for week in plan['weeks']:
  lines.append(f"Semana {week['week']} — {week['assessment']}")
  for topic in week['topics']:lines.append(topic['unidad']+' — '+topic['numero']+' '+topic['texto'])
 lines+=['Actividades en clase:',plan['academic_activities'],'Actividades extra-clase:',plan['homework'],'Bibliografía básica:',*plan['references'],plan['reference_note'],'Fuente curricular: '+(plan.get('source_pdf') or {}).get('archivo','JSON aportado')]
 return '\n'.join(lines)
