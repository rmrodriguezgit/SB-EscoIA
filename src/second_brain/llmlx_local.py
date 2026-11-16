"""Adaptador LLMLX (LocalLLM.app): gateway local sobre Ollama en 127.0.0.1:11500.

Repositorio: https://github.com/rmrodriguezgit/LLMLX. EscoIA no inicia ni configura
la app; solo habla su API nativa de Ollama. Los nombres internos llevan el prefijo
``llmlx:`` para que el selector distinga este motor del Ollama propio (11434).
"""
import importlib.util,json,os,urllib.error,urllib.parse,urllib.request
from pathlib import Path
PREFIX='llmlx:'
# Informativo (no se suma al presupuesto de EscoIA). Pesos medidos en /api/tags del gateway (2026-11-15): qwen3.5:4b 3,7 GiB nvfp4 (runner mlx).
# qwen3:8b: estimación de LLMLX en /v1/hardware-profile (6,99 GiB con ctx 8192 ×2); con un solo contexto de 4096 se reserva 6,5.
RESERVE_GIB={'llmlx:qwen3.5:4b':4.5,'llmlx:qwen3:8b':6.5}
MODELS=list(RESERVE_GIB)
HEADERS={'Content-Type':'application/json','X-Client-App':'escoia','X-Priority':'high','User-Agent':'EscoIA/1.0'}

def base():
 url=os.environ.get('LLMLX_HOST','http://127.0.0.1:11500').rstrip('/')
 p=urllib.parse.urlparse(url)
 if p.scheme!='http' or p.hostname not in {'127.0.0.1','localhost','::1'}:raise ValueError('LLMLX debe ser local')
 return url

def is_llmlx(model):return isinstance(model,str) and model.startswith(PREFIX)
def engine_name(model):return model[len(PREFIX):] if is_llmlx(model) else model

class StructuredOutputUnavailable(RuntimeError):
 """Ollama devuelve 501 con modelos del runner MLX (p. ej. qwen3.5:4b nvfp4): no aplica `format`."""
_NO_FORMAT=set()  # modelos sin salida estructurada observados en esta ejecución

class _NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):raise RuntimeError('Redirección de LLMLX no permitida')
_OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}),_NoRedirect())

def _call(path,payload,timeout):
 req=urllib.request.Request(base()+path,data=json.dumps(payload).encode() if payload is not None else None,headers=HEADERS)
 try:
  with _OPENER.open(req,timeout=timeout) as r:return json.load(r)
 except urllib.error.HTTPError as e:
  if e.code==429:raise RuntimeError('LLMLX rechazó la petición por poca RAM o cola llena; reintenta en '+(e.headers.get('Retry-After') or 'unos')+' s') from None
  if e.code==503:raise RuntimeError('LLMLX agotó la espera de un turno de inferencia') from None
  detail=e.read(400).decode('utf-8','replace')
  if e.code==501 and 'structured output' in detail:raise StructuredOutputUnavailable('LLMLX: el modelo no admite salida estructurada') from None
  raise RuntimeError(f'LLMLX: HTTP {e.code} {detail}') from None
 except urllib.error.URLError:raise RuntimeError('LLMLX no responde en '+base()+'; abre LocalLLM.app') from None

def _prefixed(models):
 return [{**m,'name':PREFIX+(m.get('name') or m.get('model','')),'model':PREFIX+(m.get('model') or m.get('name',''))} for m in models]

def request(path,payload=None,timeout=120):
 """Contrato Ollama del llamador; nombres con prefijo llmlx: hacia EscoIA."""
 body=dict(payload) if payload is not None else None
 if body and 'model' in body:body['model']=engine_name(body['model'])
 if path=='/api/chat' and body is not None:body.setdefault('think',False)  # Qwen3: sin razonamiento oculto que consuma num_predict
 if path=='/api/chat' and body is not None and body.get('format') and body['model'] in _NO_FORMAT:return _chat_template_json(body,timeout)
 try:result=_call(path,body,timeout)
 except StructuredOutputUnavailable:
  if path!='/api/chat' or not (body or {}).get('format'):raise
  _NO_FORMAT.add(body['model']);return _chat_template_json(body,timeout)
 if path in {'/api/tags','/api/ps'}:result={**result,'models':_prefixed(result.get('models',[]))}
 return result

_HELPERS=None
def _json_helpers():
 """Mismas funciones que el respaldo de Uzu (scripts/uzu_worker.py): plantilla en el prompt y validación estricta."""
 global _HELPERS
 if _HELPERS is None:
  spec=importlib.util.spec_from_file_location('escoia_uzu_json',Path(__file__).resolve().parents[2]/'scripts/uzu_worker.py')
  module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);_HELPERS=module
 return _HELPERS

def _chat_template_json(body,timeout):
 """Sin `format`: pide una plantilla JSON en el prompt y valida contra el esquema; un reintento, nunca inventa campos."""
 helpers=_json_helpers();schema=body['format']
 base_body={k:v for k,v in body.items() if k!='format'}
 messages=[dict(m) for m in body.get('messages',[])]
 last=max((i for i,m in enumerate(messages) if m.get('role')=='user'),default=None)
 if last is None:messages.append({'role':'user','content':helpers.schema_prompt(schema).strip()})
 else:messages[last]['content']+=helpers.schema_prompt(schema)
 previous=''
 for attempt in range(2):
  extra=[] if attempt==0 else [{'role':'assistant','content':previous},{'role':'user','content':'La salida anterior no cumplía el formato. Devuelve solo el objeto JSON con las claves indicadas.'}]
  out=_call('/api/chat',{**base_body,'messages':messages+extra},timeout)
  text=out.get('message',{}).get('content','')
  try:return {**out,'message':{**out.get('message',{}),'content':helpers.coerce_json(text,schema)}}
  except ValueError:previous=text[:1500]
 raise RuntimeError('LLMLX no devolvió JSON válido para el esquema tras 2 intentos')

_MODELS_CACHE=(0.0,None)
def installed(timeout=2):
 """Modelos de conversación instalados en LLMLX (con prefijo), con tamaño en GiB. Caché de 5 s."""
 global _MODELS_CACHE
 import time
 at,value=_MODELS_CACHE
 if value is not None and time.monotonic()-at<5:return value
 models=request('/api/tags',timeout=timeout).get('models',[])
 value=[{'name':m['name'],'size_gib':round(m.get('size',0)/1024**3,2)} for m in models if 'completion' in (m.get('capabilities') or ['completion'])]
 _MODELS_CACHE=(time.monotonic(),value);return value

def health(timeout=3):return _call('/health',None,timeout)

def status(timeout=2):
 """Estado para el panel: conexión, motor, breaker de RAM y memoria disponible según LLMLX."""
 try:h=health(timeout)
 except (RuntimeError,ValueError) as e:return {'connected':False,'reason':str(e)}
 out={'connected':h.get('status')=='ok','engine':h.get('engine',''),'default_model':h.get('model',''),'breaker_open':bool(h.get('breakerOpen'))}
 try:
  mem=_call('/v1/hardware-profile',None,timeout).get('memoryNow',{})
  out.update(available_gib=round(mem.get('availableBytes',0)/1024**3,2),threshold_gib=round(mem.get('thresholdBytes',0)/1024**3,2),total_gib=round(mem.get('totalBytes',0)/1024**3,1),pressure=mem.get('pressure',''))
 except (RuntimeError,ValueError):pass
 return out

def check():
 """La RAM del modelo la protege el breaker de LLMLX, no el presupuesto de EscoIA."""
 s=status()
 if not s.get('connected'):raise RuntimeError(s.get('reason') or 'LLMLX no está listo; abre LocalLLM.app')
 if s.get('breaker_open'):raise RuntimeError('LLMLX pausó la inferencia por poca RAM (breaker abierto); cierra aplicaciones y reintenta')
 return {'provider':'LLMLX','available_gib':s.get('available_gib')}
