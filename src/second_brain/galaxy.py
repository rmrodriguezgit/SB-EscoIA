"""Datos de la vista Galaxia: cada petición o tarea con su ruta, y el uso real del LLM local (LLMLX).

Solo lectura: eventos de SQLite, expedientes de data/requests y métricas de LocalLLM.app.
"""
import json,re,threading,time
from datetime import datetime

TERMINAL={'completada':'done','fallida':'error','bloqueada':'error','retenida':'held','cancelada':'cancelled','sin evidencia':'held'}
_CACHE_LOCK=threading.Lock();_llm_cache=(0.0,None)

def _parse(at):
    try:return datetime.fromisoformat(at).timestamp()
    except (TypeError,ValueError):return None

def _kind(states,is_task):
    s=set(states)
    if 'Administración' in s:return 'administracion'
    if 'Cuantitativo' in s or 'Integración' in s:return 'investigacion'
    if 'Planeación' in s or 'Archivos' in s:return 'programa'
    if 'Investigación' in s or 'Didáctica' in s or 'Notebook' in s:return 'leccion'
    if is_task:return 'cola'
    return 'consulta'

def _contract(home,rid):
    if not re.fullmatch(r'[0-9a-f]{32}',rid or ''):return {},{}
    folder=home/'data/requests'/rid
    def load(name):
        try:return json.loads((folder/name).read_text())
        except (OSError,ValueError):return {}
    return load('contract.json'),load('result.json')

def runs(brain,limit=160):
    """Últimas peticiones/tareas agrupadas por task_id, con etapas y tiempos."""
    ids=[r['task_id'] for r in brain.rows('SELECT task_id,max(id) last FROM events WHERE task_id IS NOT NULL GROUP BY task_id ORDER BY last DESC LIMIT ?',(limit,))]
    if not ids:return []
    marks=','.join('?'*len(ids))
    events={}
    for e in brain.rows(f'SELECT id,task_id,at,state,message FROM events WHERE task_id IN ({marks}) ORDER BY id',ids):events.setdefault(e['task_id'],[]).append(e)
    tasks={t['id']:t for t in brain.rows(f'SELECT id,objective,status,result FROM tasks WHERE id IN ({marks})',ids)}
    out=[]
    for rid in ids:
        ev=events.get(rid,[]);task=tasks.get(rid)
        states=[e['state'] for e in ev]
        start=_parse(ev[0]['at']) if ev else None;end=_parse(ev[-1]['at']) if ev else None
        contract,result=_contract(brain.home,rid)
        if task and task.get('result'):
            try:result={**json.loads(task['result']),**result}
            except ValueError:pass
        last=states[-1] if states else ''
        status=TERMINAL.get(last,'active')
        if task and task['status'] in ('pendiente','ejecutándose'):status='active' if task['status']=='ejecutándose' else 'queued'
        if task and task['status']=='cancelada':status='cancelled'
        if result.get('pending_operation') and status in ('done','held'):status='confirm'
        # Una petición sin evento terminal y sin actividad reciente se considera interrumpida.
        if status=='active' and end and time.time()-end>900:status='stale'
        title=(contract.get('original_request') or (task or {}).get('objective') or (ev[0]['message'] if ev else ''))
        out.append({'id':rid,'title':title[:220],'kind':_kind(states,bool(task)),'status':status,'mode':result.get('mode') or '',
                    'start':start,'end':end,'duration_s':round(end-start,2) if start and end else 0,
                    'used_llm':'Qwen' in states,'reviewed':'Laya' in states,'sources':len(result.get('sources') or []),
                    'record':contract.get('status') or '','steps':[{'state':e['state'],'message':e['message'][:240],'at':_parse(e['at'])} for e in ev[-14:]]})
    return out

def llm(window='24h'):
    """Uso real del motor local según LLMLX. Caché de 3 s; nunca lanza error al panel."""
    global _llm_cache
    with _CACHE_LOCK:
        at,value=_llm_cache
        if value is not None and value.get('window')==window and time.monotonic()-at<3:return value
    from . import llmlx_local
    try:data=llmlx_local._call('/v1/metrics?window='+window,None,3)
    except (RuntimeError,ValueError) as e:
        value={'connected':False,'reason':str(e),'window':window}
    else:
        live=data.get('live',{});mem=live.get('memory',{})
        gib=lambda b:round((b or 0)/1024**3,2)
        recent=[]
        for r in data.get('recent',[])[:40]:
            tps=None
            if r.get('completion_tokens') and r.get('eval_ms'):tps=round(r['completion_tokens']/(r['eval_ms']/1000),1)
            recent.append({'time':r.get('time'),'model':r.get('model'),'status':r.get('status'),'client':r.get('client_app'),'endpoint':r.get('endpoint'),
                           'prompt_tokens':r.get('prompt_tokens'),'completion_tokens':r.get('completion_tokens'),'tokens_per_sec':tps,'error':r.get('error')})
        value={'connected':True,'window':window,'engine':live.get('engine',''),'default_model':live.get('model',''),
               'loaded':[m.get('name') or m.get('model') for m in live.get('loadedModels',[])],
               'in_flight':live.get('inFlight',0),'queued':live.get('queued',0),'capacity':live.get('capacity',1),
               'breaker_open':bool(live.get('breakerOpen')),'paused':bool(live.get('paused')),
               'memory':{'available_gib':gib(mem.get('availableBytes')),'threshold_gib':gib(mem.get('thresholdBytes')),'total_gib':gib(mem.get('totalBytes')),
                         'swap_gib':gib(mem.get('swapUsedBytes')),'compressed_gib':gib(mem.get('compressedBytes')),'wired_gib':None,'pressure':mem.get('pressure','')},
               'totals':data.get('totals',{}),'by_model':data.get('byModel',[]),'by_client':data.get('byClient',[]),
               'recent':recent,'incidents':data.get('incidents',[])[:8],'session':live.get('session',{})}
    with _CACHE_LOCK:_llm_cache=(time.monotonic(),value)
    return value

def snapshot(brain,window='24h'):
    if window not in {'1h','24h','7d'}:window='24h'
    from .runtime import PIPELINE_LOCK,local_model
    return {'generated':time.time(),'busy':PIPELINE_LOCK.locked(),'model':local_model(),'runs':runs(brain),'llm':llm(window)}
