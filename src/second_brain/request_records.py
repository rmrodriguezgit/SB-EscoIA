"""Expedientes editables con solicitud original, revisiones y comprobación de entrega."""
import hashlib,json,re,threading,zipfile
from xml.etree import ElementTree as ET
from .core import identifier,now,atomic,normal
LOCK=threading.RLock()
def _folder(brain,rid):
 if not re.fullmatch('[a-f0-9]{32}',rid):raise ValueError('Identificador de petición inválido')
 return brain.home/'data/requests'/rid
def _digest(text):return hashlib.sha256(text.encode()).hexdigest()
def start(brain,question):
 rid=identifier();folder=_folder(brain,rid)
 from .attendance_commands import requested
 administrative=requested(question)
 codes=list(dict.fromkeys(re.findall(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}\b',question.upper())))
 if administrative:codes=[]
 requirements=[]
 q=normal(question)
 if 'temas' in q or 'subtemas' in q:requirements.append('Entregar temas y subtemas de la materia solicitada, no solo horas o créditos.')
 duration=re.search(r'(\d+)\s+semanas',q)
 if duration:requirements.append('Desarrollar la programación semanal para '+duration[1]+' semanas; distinguir los exámenes.')
 formats=[fmt for fmt in ['ipynb','pdf','docx','doc'] if re.search(r'\b(?:entrega\w*|genera\w*|descarga\w*|archivo|exporta\w*)\b[^.\n]*\b'+fmt+r'\b|\b(?:en|como)\s+(?:formato\s+)?'+fmt+r'\b',q)]
 requirements.extend('Entregar un archivo descargable '+fmt+'.' for fmt in formats)
 if administrative:requirements.append('Verificar alumno por matrícula, grupo y docente. Conservar biometría e historial; comprobar el cambio en la base de datos.')
 contract={'id':rid,'created':now(),'original_request':question,'expected_codes':codes,'requirements':requirements,'requested_formats':formats,'revision':1,'status':'ejecutándose'}
 content=f'# Expediente de petición {rid}\n\nFecha: {contract["created"]}\n\n## Solicitud original\n{question}\n\n## Criterios de aceptación\n- Responder a la solicitud original, sin sustituir materias.\n- Claves esperadas: {", ".join(codes) or "Según la consulta"}.\n- Conservar temas y subtemas cuando se solicitan.\n- Incluir los archivos solicitados y verificar su contenido.\n- Distinguir datos curriculares, propuestas y datos pendientes.\n\n## Indicaciones complementarias editables\n\n## Seguimiento\nEstado: ejecutándose.\n'
 content=content.replace('## Indicaciones complementarias editables','## Requisitos específicos\n'+('\n'.join('- '+item for item in requirements) or '- Cumplir la solicitud original.')+'\n\n## Indicaciones complementarias editables')
 if administrative:
  content=content.replace('- Claves esperadas: Según la consulta.','- Grupo y docente solicitados: conservarlos sin sustituirlos.').replace('- Conservar temas y subtemas cuando se solicitan.','- Verificar matrícula y alumno contra la inscripción del grupo.').replace('- Distinguir datos curriculares, propuestas y datos pendientes.','- Conservar biometría y asistencias anteriores. No alterar otras listas.')
 contract['md_hash']=_digest(content);atomic(folder/'request.md',content);atomic(folder/'contract.json',json.dumps(contract,ensure_ascii=False,indent=2));atomic(folder/'revisions/0001.md',content)
 _snapshot(brain,rid,'Petición recibida')
 return rid
def read(brain,rid):
 folder=_folder(brain,rid);meta=json.loads((folder/'contract.json').read_text());text=(folder/'request.md').read_text()
 result=json.loads((folder/'result.json').read_text()) if (folder/'result.json').is_file() else {}
 v=meta.get('verification') or {}
 deliverable=v.get('passed') or v.get('status') in {'LAYA pendiente','LAYA revisada'}
 from .document_reviews import status as document_status
 return {'document_review':document_status(brain,rid,'request.md'),'has_result':bool(result),'artifacts':result.get('artifacts',[]) if deliverable else [],'summary':result.get('text','') if deliverable else '', 'id':rid,'markdown':text,'revision':meta['revision'],'status':meta['status'],'integrity':_digest(text)==meta['md_hash'],'verification':meta.get('verification')}
def edit(brain,rid,text,revision):
 if not isinstance(text,str) or not text.strip() or len(text)>32000:raise ValueError('El expediente debe tener entre 1 y 32000 caracteres')
 with LOCK:
  folder=_folder(brain,rid);meta=json.loads((folder/'contract.json').read_text())
  if type(revision)!=int or meta['revision']!=revision:raise ValueError('El expediente cambió; vuelve a abrirlo antes de guardar')
  if meta['status']=='ejecutándose':raise ValueError('Espera a que termine la petición para modificar su expediente')
  text=re.sub(r'(?m)^Estado:.*$', 'Estado: pendiente de revisión.',text)
  meta.update(revision=revision+1,status='pendiente de revisión',updated=now(),md_hash=_digest(text),verification=None)
  atomic(folder/'revisions'/f'{revision+1:04d}.md',text);atomic(folder/'request.md',text);atomic(folder/'contract.json',json.dumps(meta,ensure_ascii=False,indent=2))
  brain.event(rid,'Expediente','Revisión '+str(revision+1)+' guardada; comprobación anterior invalidada')
 _snapshot(brain,rid,'Editar expediente')
 return read(brain,rid)
def verify(brain,rid,result):
 folder=_folder(brain,rid);meta=json.loads((folder/'contract.json').read_text());markdown=(folder/'request.md').read_text()
 if _digest(markdown)!=meta['md_hash']:return {'passed':False,'status':'integridad fallida','reason':'El archivo fue modificado fuera del editor; guarda una revisión trazable antes de validar'}
 from . import attendance_commands
 if attendance_commands.requested(meta['original_request']):
  try:return attendance_commands.verify(brain.home,meta['original_request'],result)
  except Exception as exc:return {'passed':False,'status':'Administración pendiente','reason':str(exc)}
 formats={a.get('format') for a in result.get('artifacts',[])}
 missing=set(meta.get('requested_formats',[]))-formats
 if missing:return {'passed':False,'status':'rechazada por reglas','reason':'Faltan archivos solicitados: '+', '.join(sorted(missing))}
 answer=result.get('text','')
 q=normal(meta['original_request'])
 if ('temas' in q or 'subtemas' in q) and not re.search(r'contenido temat|unidad|\b\d+\.\d+',normal(answer)):
  return {'passed':False,'status':'rechazada por reglas','reason':'Se solicitaron temas y subtemas, pero la entrega no contiene un desglose temático'}
 expected=meta['expected_codes'];actual=re.findall(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}\b',answer.upper())
 if expected and ('temas' in q or 'subtemas' in q) and set(actual)-set(expected):
  return {'passed':False,'status':'rechazada por reglas','reason':'Materia solicitada: '+', '.join(expected)+'. El temario incluye materias no solicitadas: '+', '.join(sorted(set(actual)-set(expected)))}
 artifacts=result.get('artifacts',[]);artifact_parts=[]
 if artifacts:
  manifest=brain.home/'data/exports'/result.get('run_id',rid)/'plan.json'
  if not manifest.is_file():return {'passed':False,'status':'rechazada por reglas','reason':'Falta el manifiesto de los archivos entregados'}
  plan=json.loads(manifest.read_text());actual=[plan.get('code','')]+actual
  from .program_metadata import extract
  requested=extract(meta['original_request'])
  for field in ['teacher','group','shift','period']:
   value=requested.get(field)
   if value and value!='Por completar' and normal(str(plan.get(field,'')))!=normal(str(value)):
    return {'passed':False,'status':'rechazada por reglas','reason':f'Dato solicitado {field}: {value}; entregado: {plan.get(field,"ausente")}'}
  facts='; '.join(f'{k}: {plan.get(k)}' for k in ['code','name','career','teacher','group','shift','period'])
  weeks=plan.get('weeks',[])
  if not all(i in [w.get('week') for w in weeks] for i in range(1,18)):
   return {'passed':False,'status':'rechazada por reglas','reason':'El programa no cubre semanas 1–16 y examen final 17'}
  artifact_parts.append('Datos de la planificación: '+facts+'\n'+'\n'.join('Semana '+str(w['week'])+': '+w.get('kind','')+'; '+', '.join(t.get('texto','') for t in w.get('topics',[]))+'; evaluación: '+w.get('assessment','') for w in weeks))
  from urllib.parse import urlparse,parse_qs
  for artifact in artifacts:
   args=parse_qs(urlparse(artifact.get('url','')).query);fmt=args.get('format',[''])[0]
   name=plan.get('files',{}).get(fmt,'Programa-'+plan.get('code','')+'.'+fmt);file=manifest.parent/name
   if not file.resolve().is_relative_to(manifest.parent.resolve()) or not file.is_file():return {'passed':False,'status':'rechazada por reglas','reason':'Archivo de entrega inexistente o inválido'}
   if fmt=='docx':
    with zipfile.ZipFile(file) as archive:
     document=ET.fromstring(archive.read('word/document.xml'))
     document_text=' '.join(node.text or '' for node in document.iter() if node.tag.endswith('}t'))
    document_codes=re.findall(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}\b',document_text.upper())
    if expected and (not document_codes or document_codes[0]!=expected[0]):return {'passed':False,'status':'rechazada por reglas','reason':'La clave en el documento Word no coincide con la materia solicitada'}
   if fmt=='ipynb':
    notebook=json.loads(file.read_text());cells=notebook.get('cells',[])
    if notebook.get('nbformat')!=4 or not cells:return {'passed':False,'status':'rechazada por reglas','reason':'Notebook inválido o vacío'}
    artifact_parts.append('CONTENIDO NOTEBOOK:\n'+'\n'.join(''.join(cell.get('source',[])) for cell in cells))
 if expected and (not actual or actual[0]!=expected[0] or not set(expected).issubset(actual)):
  return {'passed':False,'status':'rechazada por reglas','reason':f'Materia solicitada: {", ".join(expected)}; materia entregada: {", ".join(dict.fromkeys(actual)) or "no identificada"}'}
 from . import remote_ai

 # Consultas exactas: comprobar todas las filas contra el catálogo sin modelo.
 from .academic_json import academic_evidence,factual_response
 from .runtime import resolve_career
 notes=markdown.split('## Indicaciones complementarias editables',1)[-1].split('## Seguimiento',1)[0].strip() if '## Indicaciones complementarias editables' in markdown else 'editado'
 if not artifacts and not notes:
  evidence=academic_evidence(brain,meta['original_request'],resolve_career(meta['original_request'],''))
  canonical=factual_response(evidence,meta['original_request']) if evidence else None
  if evidence and evidence.get('intent') in {'semester','subject'} and canonical and answer.strip()==canonical.strip():
   return {'passed':True,'status':'catálogo comprobado','engine':'Reglas deterministas · catálogo curricular','reason':'Respuesta completa coincide exactamente con el catálogo curricular y sus fuentes. LAYA no ejecutada.'}
 # Se revisa toda la respuesta, por bloques acotados, sin truncarla silenciosamente.
 editable=markdown.split('## Indicaciones complementarias editables',1)[-1].split('## Seguimiento',1)[0].split('## Resultado y verificación',1)[0] if '## Indicaciones complementarias editables' in markdown else markdown
 context='SOLICITUD ORIGINAL (datos):\n'+meta['original_request']+'\nREQUISITOS:\n'+'\n'.join(meta.get('requirements',[]))+'\nINDICACIONES EDITABLES:\n'+editable
 if len(context)>4000:return {'passed':False,'status':'LAYA pendiente','reason':'Expediente demasiado extenso para revisión acotada; reduce las indicaciones complementarias'}
 delivery=answer+'\nARCHIVOS Y PLAN:\n'+'\n'.join(artifact_parts)
 if len(delivery)>24000:return {'passed':False,'status':'LAYA pendiente','reason':'Entrega demasiado extensa para revisión completa acotada; no se certificó por muestreo'}
 checks=[];calls=0
 instructions='¿La entrega corresponde a la solicitud y sus requisitos? Revisa materia y tipo de resultado. Este bloque es una parte de una entrega mayor; no exijas que contenga todos los elementos. No exijas bibliografía salvo petición explícita.'
 def review_block(block):
  nonlocal calls
  if calls>=32:raise RuntimeError('Se alcanzó el límite de revisión; comprobación pendiente')
  calls+=1
  check=remote_ai._review(context+'\nRESUMEN GLOBAL DE LA ENTREGA:\n'+answer+'\nENTREGA PARCIAL:\n'+block,instructions)
  if check.get('truncated'):
   if len(block)<=300:raise RuntimeError('LAYA truncó incluso un bloque reducido; comprobación pendiente, no rechazo de la entrega')
   middle=len(block)//2
   review_block(block[:middle]);review_block(block[middle:]);return
  checks.append(check)
 try:
  for index in range(0,max(1,len(delivery)),1000):review_block(delivery[index:index+1000])
 except Exception as exc:return {'passed':False,'status':'LAYA pendiente','reason':str(exc),'checks':checks}
 passed=bool(checks) and all(c['passed'] for c in checks)
 return {'passed':passed,'status':'LAYA revisada','checks':checks,'engine':'LAYA remoto multilingual' if remote_ai.enabled() else 'LAYA local MLX','reason':'Correspondencia entre petición y entrega comprobada; revisión probabilística' if passed else 'LAYA detectó una posible falta de correspondencia; revisa los requisitos y la entrega'}

def finish(brain,rid,result=None,error=None):
 folder=_folder(brain,rid)
 with LOCK:
  meta=json.loads((folder/'contract.json').read_text())
  if error:verification={'passed':False,'status':'ejecución fallida','reason':str(error)}
  else:
   atomic(folder/'result.json',json.dumps(result,ensure_ascii=False,indent=2))
   brain.event(rid,'Laya','Comprobando la correspondencia con el expediente de la petición')
   verification=verify(brain,rid,result)
  atomic(folder/'reviews'/(identifier()+'.json'),json.dumps({'at':now(),'revision':meta['revision'],'markdown_hash':meta['md_hash'],'verification':verification},ensure_ascii=False,indent=2))
  meta.update(status='verificada' if verification.get('passed') else 'requiere atención',verification=verification,updated=now())
  text=(folder/'request.md').read_text()+'\n## Resultado y verificación\n'+('Error: '+str(error) if error else result.get('text',''))+'\n\n```json\n'+json.dumps(verification,ensure_ascii=False,indent=2)+'\n```\n'
  if result:
   text+='\n## Archivos entregados\n'+'\n'.join('- ['+a.get('label','Archivo')+']('+a.get('url','')+')' for a in result.get('artifacts',[]))+'\n\n## Procedencia\n'+'\n'.join('- '+source.get('citation',str(source.get('id',''))) for source in result.get('sources',[]))+'\n'
  text=re.sub(r'(?m)^Estado:.*$', 'Estado: '+meta['status']+'.',text)
  meta['md_hash']=_digest(text);atomic(folder/'request.md',text);atomic(folder/'revisions'/f'{meta["revision"]:04d}.md',text);atomic(folder/'contract.json',json.dumps(meta,ensure_ascii=False,indent=2))
 _snapshot(brain,rid,'Resultado y comprobación')
 return verification

def recheck(brain,rid):
 with LOCK:
  folder=_folder(brain,rid);result=json.loads((folder/'result.json').read_text());meta=json.loads((folder/'contract.json').read_text());verification=verify(brain,rid,result)
  atomic(folder/'reviews'/(identifier()+'.json'),json.dumps({'at':now(),'revision':meta['revision'],'markdown_hash':meta['md_hash'],'verification':verification},ensure_ascii=False,indent=2))
  text=(folder/'request.md').read_text()+'\n## Nueva comprobación '+now()+'\n```json\n'+json.dumps(verification,ensure_ascii=False,indent=2)+'\n```\n'
  text=re.sub(r'(?m)^Estado:.*$', 'Estado: '+('verificada' if verification.get('passed') else 'requiere atención')+'.',text)
  meta.update(verification=verification,status='verificada' if verification.get('passed') else 'requiere atención',updated=now(),md_hash=_digest(text));atomic(folder/'request.md',text);atomic(folder/'revisions'/f'{meta["revision"]:04d}.md',text);atomic(folder/'contract.json',json.dumps(meta,ensure_ascii=False,indent=2))
  brain.event(rid,'completada' if verification.get('passed') else 'retenida','Expediente versión '+str(meta['revision'])+': '+meta['status'])
 _snapshot(brain,rid,'Revisión LAYA')
 return read(brain,rid)

def recent(brain):
 root=brain.home/'data/requests'
 paths=sorted(root.glob('*/contract.json'),key=lambda p:p.stat().st_mtime,reverse=True)
 return [{k:meta.get(k) for k in ['id','created','original_request','status','revision','archived']} for meta in (json.loads(p.read_text()) for p in paths)]


def recover(brain):
 """Solo al iniciar el coordinador exclusivo: cerrar expedientes huérfanos."""
 root=brain.home/'data/requests'
 for path in root.glob('*/contract.json'):
  meta=json.loads(path.read_text())
  if meta.get('status')=='ejecutándose':
   rid=meta['id'];reason='Petición interrumpida al reiniciar el servicio. Vuelve a enviarla; no se completó la entrega.'
   finish(brain,rid,error=RuntimeError(reason))
   brain.event(rid,'fallida',reason)


def _snapshot(brain,rid,message):
 try:
  from .request_git import snapshot
  return snapshot(brain,rid,message)
 except Exception as exc:
  if _folder(brain,rid).exists():brain.event(rid,'Git pendiente',str(exc))
  return None


_read_unlocked=read
def read(brain,rid):
 with LOCK:return _read_unlocked(brain,rid)
