"""Adaptador LLMLX (LocalLLM.app): gateway local sobre Ollama en 127.0.0.1:11500.

Repositorio: https://github.com/rmrodriguezgit/LLMLX. EscoIA no inicia ni configura
la app; solo habla su API nativa de Ollama. Los nombres internos llevan el prefijo
``llmlx:`` para que el selector distinga este motor del Ollama propio (11434).
"""
import json,os,urllib.error,urllib.parse,urllib.request
PREFIX='llmlx:'
# Pesos medidos en /api/tags del gateway (2026-11-15): qwen3.5:4b 3,7 GiB nvfp4 (runner mlx).
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
  raise RuntimeError(f'LLMLX: HTTP {e.code} {detail}') from None
 except urllib.error.URLError:raise RuntimeError('LLMLX no responde en '+base()+'; abre LocalLLM.app') from None

def _prefixed(models):
 return [{**m,'name':PREFIX+(m.get('name') or m.get('model','')),'model':PREFIX+(m.get('model') or m.get('name',''))} for m in models]

def request(path,payload=None,timeout=120):
 """Contrato Ollama del llamador; nombres con prefijo llmlx: hacia EscoIA."""
 body=dict(payload) if payload is not None else None
 if body and 'model' in body:body['model']=engine_name(body['model'])
 if path=='/api/chat' and body is not None:body.setdefault('think',False)  # Qwen3: sin razonamiento oculto que consuma num_predict
 result=_call(path,body,timeout)
 if path in {'/api/tags','/api/ps'}:result={**result,'models':_prefixed(result.get('models',[]))}
 return result

def health(timeout=3):return _call('/health',None,timeout)
