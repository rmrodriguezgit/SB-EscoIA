"""Un repositorio Git privado por petición; sin remotos ni ejecución de artefactos."""
import hashlib,json,os,re,shutil,sqlite3,subprocess
from pathlib import Path
from .core import atomic,now

def safe_bytes(data):
 try:text=data.decode('utf-8')
 except UnicodeError:return data
 def redact(text):
  text=re.sub(r'(?i)\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|Bearer[ \t]+[A-Za-z0-9._-]{20,})','[SECRETO OMITIDO]',text)
  return re.sub(r'(?i)((?:password|contraseña|api_key|access_token)\s*[:=]\s*)[^\s,;]+',r'\1[SECRETO OMITIDO]',text)
 def walk(value):
  if isinstance(value,dict):return {k:'[SECRETO OMITIDO]' if k.lower() in {'password','contraseña','api_key','access_token','authorization'} else walk(v) for k,v in value.items()}
  if isinstance(value,list):return [walk(v) for v in value]
  return redact(value) if isinstance(value,str) else value
 try:return json.dumps(walk(json.loads(text)),ensure_ascii=False,indent=2).encode()
 except ValueError:return redact(text).encode()


def repo(brain,rid):
 from .request_records import _folder
 _folder(brain,rid)
 return brain.home/'data/request-git'/rid

def git(path,*args):
 env={k:v for k,v in os.environ.items() if not k.startswith('GIT_')}
 env.update(GIT_AUTHOR_NAME='EscoIA',GIT_AUTHOR_EMAIL='local@escoia.invalid',GIT_COMMITTER_NAME='EscoIA',GIT_COMMITTER_EMAIL='local@escoia.invalid',GIT_TERMINAL_PROMPT='0')
 p=subprocess.run(['git','-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-C',str(path),*args],capture_output=True,timeout=20,env=env)
 if p.returncode:raise ValueError('No se pudo completar la operación Git local: '+p.stderr.decode(errors='replace')[:300])
 return p.stdout

def snapshot(brain,rid,message):
 from .request_records import _folder
 if not _folder(brain,rid).is_dir():raise ValueError('Expediente inexistente')
 path=repo(brain,rid);path.mkdir(parents=True,exist_ok=True);path.chmod(0o700)
 folder=_folder(brain,rid)
 if not (path/'.git').exists():
  git(path,'init','--quiet')
  legacy=sorted((folder/'revisions').glob('*.md'))
  if len(legacy)>1 or (folder/'result.json').exists():
   for old in legacy:
    (path/'request.md').write_bytes(safe_bytes(old.read_bytes()));(path/'request.md').chmod(0o600)
    git(path,'add','request.md')
    if git(path,'status','--porcelain').strip():git(path,'commit','--quiet','-m','Importar revisión Markdown '+old.stem)
 for name in ('request.md','contract.json','result.json'):
  source=folder/name
  if source.exists():(path/name).write_bytes(safe_bytes(source.read_bytes()));(path/name).chmod(0o600)
  elif (path/name).exists():(path/name).unlink()
 events=brain.rows('SELECT at,state,message FROM events WHERE task_id=? ORDER BY id',(rid,))
 atomic(path/'agents.json',safe_bytes(json.dumps(events,ensure_ascii=False,indent=2).encode()).decode())
 source=brain.home/'data/exports'/rid;target=path/'artifacts'
 if target.exists():shutil.rmtree(target)
 if source.exists():
  total=0
  for f in source.iterdir():
   if f.is_file() and not f.is_symlink():
    total+=f.stat().st_size
    if total>64*1024**2:raise ValueError('Los artefactos exceden 64 MiB por versión')
    target.mkdir(exist_ok=True);(target/f.name).write_bytes(safe_bytes(f.read_bytes()));(target/f.name).chmod(0o600)
 git(path,'add','--all')
 if git(path,'status','--porcelain').strip():git(path,'commit','--quiet','-m',message)
 return git(path,'rev-parse','HEAD').decode().strip()

def history(brain,rid):
 from .request_records import read
 read(brain,rid)
 path=repo(brain,rid)
 if not (path/'.git').exists():snapshot(brain,rid,'Importar expediente existente')
 commits=[]
 for line in git(path,'log','--format=%H%x09%aI%x09%s').decode().splitlines():
  sha,date,message=line.split('\t',2);commits.append({'sha':sha,'date':date,'message':message})
 files=git(path,'ls-tree','-r','--name-only','HEAD').decode().splitlines()
 from .document_reviews import statuses
 return {'document_reviews':statuses(brain,rid),'id':rid,'head':commits[0]['sha'],'commits':commits,'files':files,'agents':brain.rows('SELECT at,state,message FROM events WHERE task_id=? ORDER BY id',(rid,))}

def revision(brain,rid,sha):
 if not re.fullmatch('[a-f0-9]{40}',sha):raise ValueError('Versión Git inválida')
 path=repo(brain,rid);history(brain,rid)
 if sha not in git(path,'rev-list','HEAD').decode().splitlines():raise ValueError('Versión ajena al expediente')
 return path

def diff(brain,rid,sha):
 path=revision(brain,rid,sha)
 return git(path,'diff','--no-ext-diff',sha,'HEAD','--','request.md','result.json','artifacts').decode(errors='replace')[:120000]

def check_head(brain,rid,head):
 from .request_records import read
 if read(brain,rid)['status']=='ejecutándose':raise ValueError('Espera a que termine la petición')
 if history(brain,rid)['head']!=head:raise ValueError('El expediente cambió; actualiza antes de continuar')

def rollback(brain,rid,sha,head):
 from . import request_records as records
 with records.LOCK:
  check_head(brain,rid,head);path=revision(brain,rid,sha);folder=records._folder(brain,rid)
  meta=json.loads((folder/'contract.json').read_text())
  text=git(path,'show',sha+':request.md').decode()
  files=git(path,'ls-tree','-r','--name-only',sha).decode().splitlines()
  if 'contract.json' not in files:
   return records.edit(brain,rid,text,meta['revision'])
  # Restaurar documentos no repite acciones administrativas ni vuelve a ejecutar agentes.
  export=brain.home/'data/exports'/rid
  if export.exists():shutil.rmtree(export)
  for name in files:
   if name.startswith('artifacts/'):
    relative=Path(name).relative_to('artifacts')
    if len(relative.parts)!=1:raise ValueError('Ruta de artefacto inválida')
    target=export/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(git(path,'show',sha+':'+name));target.chmod(0o600)
  if 'result.json' in files:atomic(folder/'result.json',git(path,'show',sha+':result.json').decode())
  elif (folder/'result.json').exists():(folder/'result.json').unlink()
  text=re.sub(r'(?m)^Estado:.*$','Estado: pendiente de revisión.',text)
  meta.update(revision=meta['revision']+1,status='pendiente de revisión',verification=None,updated=now(),md_hash=hashlib.sha256(text.encode()).hexdigest())
  atomic(folder/'request.md',text);atomic(folder/'contract.json',json.dumps(meta,ensure_ascii=False,indent=2));atomic(folder/'revisions'/f'{meta["revision"]:04d}.md',text)
  brain.event(rid,'Rollback','Restauración documental de '+sha[:12]+'; revisión invalidada')
  snapshot(brain,rid,'Restaurar '+sha[:12])
  return records.read(brain,rid)

def artifact(brain,rid,name,text=None,head=None):
 from . import request_records as records
 with records.LOCK:
  path=repo(brain,rid);files=history(brain,rid)['files']
  if name not in files or not name.startswith('artifacts/') or Path(name).suffix.lower() not in {'.md','.txt','.json','.ipynb'}:raise ValueError('Selecciona un artefacto de texto editable')
  if len(Path(name).parts)!=2:raise ValueError('Ruta inválida')
  target=brain.home/'data/exports'/rid/Path(name).name
  if text is None:return {'name':name,'text':target.read_text(),'head':history(brain,rid)['head']}
  check_head(brain,rid,head)
  if not isinstance(text,str) or len(text)>300000:raise ValueError('Texto inválido (máximo 300000 caracteres)')
  if Path(name).suffix in {'.json','.ipynb'}:
   value=json.loads(text)
   if Path(name).suffix=='.ipynb' and (not isinstance(value,dict) or value.get('nbformat')!=4 or not isinstance(value.get('cells'),list)):raise ValueError('Notebook inválido')
  atomic(target,text)
  folder=records._folder(brain,rid);meta=json.loads((folder/'contract.json').read_text());meta.update(verification=None,status='pendiente de revisión',revision=meta['revision']+1,updated=now())
  markdown=re.sub(r'(?m)^Estado:.*$','Estado: pendiente de revisión.',(folder/'request.md').read_text());meta['md_hash']=hashlib.sha256(markdown.encode()).hexdigest()
  atomic(folder/'request.md',markdown);atomic(folder/'contract.json',json.dumps(meta,ensure_ascii=False,indent=2));atomic(folder/'revisions'/f'{meta["revision"]:04d}.md',markdown)
  snapshot(brain,rid,'Editar artefacto '+Path(name).name)
  return records.read(brain,rid)

def reuse(brain,rid,head):
 from . import request_records as records
 with records.LOCK:
  check_head(brain,rid,head)
  folder=records._folder(brain,rid);meta=json.loads((folder/'contract.json').read_text())
  new=records.start(brain,meta['original_request']);target=records._folder(brain,new)
  draft=json.loads((target/'contract.json').read_text());draft.update(status='borrador',parent_request=rid)
  text=(folder/'request.md').read_text().split('\n## Resultado y verificación',1)[0].split('\n## Nueva comprobación',1)[0]
  text=text.replace('# Expediente de petición '+rid,'# Expediente de petición '+new)
  text=re.sub(r'(?m)^Estado:.*$','Estado: borrador.',text)+'\n## Plantilla de origen\n'+rid+'\n'
  draft['md_hash']=hashlib.sha256(text.encode()).hexdigest();atomic(target/'request.md',text);atomic(target/'contract.json',json.dumps(draft,ensure_ascii=False,indent=2));atomic(target/'revisions/0001.md',text)
  snapshot(brain,new,'Crear borrador desde '+rid[:12]);return {'id':new}

def archive(brain,rid,head,archived=True):
 from . import request_records as records
 with records.LOCK:
  check_head(brain,rid,head)
  path=records._folder(brain,rid)/'contract.json';meta=json.loads(path.read_text())
  meta.update(archived=archived,updated=now())
  atomic(path,json.dumps(meta,ensure_ascii=False,indent=2))
  snapshot(brain,rid,'Mover a papelera' if archived else 'Recuperar de papelera')
  return {'archived':archived}


def scrub_backups(brain,rid,original):
 cleaned=[];pending=[];root=brain.home/'data/backups'
 for path in root.rglob('*') if root.exists() else []:
  if not path.is_file() or path.is_symlink():continue
  if path.suffix not in {'.sqlite','.sqlite3','.db'}:
   if path.suffix in {'.zip','.tar','.gz'}:pending.append(path.name)
   continue
  try:
   with sqlite3.connect(path) as db:
    db.row_factory=sqlite3.Row
    tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'memories' not in tables:continue
    db.execute('PRAGMA secure_delete=ON')
    memories=db.execute("SELECT id FROM memories WHERE reference=? OR reference=? OR (type='sessions' AND substr(text,1,?)=?)",(rid,'request:'+rid,len(original)+1,original+'\n')).fetchall()
    for m in memories:
     mid=m['id']
     for table in ('search','vectors','memories'):
      if table in tables:db.execute('DELETE FROM '+table+' WHERE id=?',(mid,))
     if 'edges' in tables:db.execute('DELETE FROM edges WHERE origin=? OR target=?',(mid,mid))
     if (path.parent/'manifest.json').is_file():
      for f in (path.parent/'memory').glob('*/'+mid+'.json'):f.unlink()
    if 'events' in tables:db.execute('DELETE FROM events WHERE task_id=?',(rid,))
    if 'tasks' in tables:db.execute('DELETE FROM tasks WHERE id=?',(rid,))
    db.commit();db.execute('VACUUM')
   cleaned.append(path.name)
  except (OSError,sqlite3.Error):pending.append(path.name)
 return cleaned,pending


def remove(brain,rid,head,confirmation):
 from . import request_records as records
 with records.LOCK:
  check_head(brain,rid,head)
  if confirmation!=rid:raise ValueError('Confirma el identificador de la petición para eliminarla')
  folder=records._folder(brain,rid)
  # Recuerdos derivados enlazados y conversaciones históricas con la pregunta exacta.
  meta=json.loads((folder/'contract.json').read_text());original=meta['original_request']
  brain.db.execute('PRAGMA secure_delete=ON')
  children=[]
  for child in (brain.home/'data/requests').glob('*/contract.json'):
   value=json.loads(child.read_text())
   if value.get('parent_request')==rid:children.append(value['id'])
  for child in children:check_head(brain,child,history(brain,child)['head'])
  for child in children:
   child_head=history(brain,child)['head']
   remove(brain,child,child_head,child)
  mids=brain.rows('SELECT id FROM memories WHERE reference=? OR reference=? OR (type=\'sessions\' AND substr(text,1,?)=?)',(rid,'request:'+rid,len(original)+1,original+'\n'))
  for m in mids:brain.forget(m['id'])
  with brain.db:
   brain.db.execute('PRAGMA secure_delete=ON')
   brain.db.execute('DELETE FROM events WHERE task_id=?',(rid,))
   brain.db.execute('DELETE FROM edges WHERE origin=? OR target=?',(rid,rid))
   brain.db.execute('DELETE FROM tasks WHERE id=?',(rid,))
  for path in [repo(brain,rid),folder,brain.home/'data/exports'/rid]:
   if path.exists():shutil.rmtree(path)
  brain.db.execute('VACUUM')
  backups,pending=scrub_backups(brain,rid,original)
  return {'backups_cleaned':backups,'backups_pending':pending,'forgotten':rid,'memories_removed':len(mids),'scope':'Expediente, versiones Git, revisiones, artefactos, eventos y recuerdos derivados enlazados. No revierte operaciones académicas ni borra documentos fuente compartidos, respaldos externos o descargas. Respaldos locales SQLite administrados depurados; archivos no depurables se notifican.'}


def _locked(fn):
 from functools import wraps
 @wraps(fn)
 def run(*args,**kwargs):
  from .request_records import LOCK
  with LOCK:return fn(*args,**kwargs)
 return run
for _name in ('snapshot','history','diff','rollback','artifact','reuse','archive','remove'):
 globals()[_name]=_locked(globals()[_name])
