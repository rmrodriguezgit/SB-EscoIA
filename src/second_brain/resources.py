"""Telemetría cacheada y liberación de modelos propios sin vaciar macOS."""
import gc,concurrent.futures,os,re,subprocess,threading,time
from .runtime import ollama,PIPELINE_LOCK,model_reserve_gib,local_model
POOL=concurrent.futures.ThreadPoolExecutor(max_workers=2,thread_name_prefix='escoia-telemetry')
_LOCK=threading.Lock();_cache={};_stamp=0;LAYA_PID=None
THREADS=min(6,max(1,(os.cpu_count() or 2)-2))

def snapshot(home):
 global _cache,_stamp
 with _LOCK:
  if time.monotonic()-_stamp<3 and _cache:return dict(_cache)
  def vm():
   stats=subprocess.run(['vm_stat'],capture_output=True,text=True,timeout=3,check=True).stdout
   pressure=int(subprocess.run(['sysctl','-n','kern.memorystatus_vm_pressure_level'],capture_output=True,text=True,timeout=3,check=True).stdout)
   page=int(re.search(r'page size of (\d+)',stats)[1])
   used=sum(int(re.search('^'+re.escape(k)+r':\s+(\d+)',stats,re.M)[1]) for k in ['Anonymous pages','Pages wired down','Pages occupied by compressor'])*page/1024**3
   swap=subprocess.run(['sysctl','vm.swapusage'],capture_output=True,text=True,timeout=3).stdout.strip()
   return {'used_gib':round(used,2),'limit_gib':12.5,'pressure':'Normal' if pressure==1 else 'Alta','swap':swap}
  v=POOL.submit(vm);o=POOL.submit(lambda:ollama('/api/ps',timeout=3))
  try:memory=v.result(timeout=5)
  except Exception:memory={'error':'Telemetría de memoria no disponible','limit_gib':12.5}
  try:models=o.result(timeout=5).get('models',[]);available=True
  except Exception:models=[];available=False
  resident=[{'name':m.get('name',m.get('model','')),'size_gib':round(m.get('size',0)/1024**3,2)} for m in models]
  laya_available=(home/'.venv-laya/bin/python').exists() and (home/'data/models/laya/mlx_config.json').exists()
  if 'used_gib' in memory:
   from . import remote_ai
   reserve=0 if remote_ai.enabled() else model_reserve_gib();headroom=memory['limit_gib']-memory['used_gib']
   memory.update(headroom_gib=round(headroom,2),reserve_gib=round(reserve,2),shortfall_gib=round(max(0,reserve-headroom),2),can_load=headroom>=reserve and memory.get('pressure')=='Normal')
  _cache={'memory':memory,'qwen':{'server_available':available,'resident':resident,'status':'Cargado' if resident else 'Disponible sin cargar' if available else 'Sin conexión'},'laya':{'available':laya_available,'status':'Revisando' if LAYA_PID else 'Disponible sin cargar' if laya_available else 'No instalado'},'pipeline_busy':PIPELINE_LOCK.locked(),'cpu_threads':THREADS,'io_workers':2,'pdf_workers':2,'generation_parallel':1}
  if remote_ai.enabled():
   from .runtime import model_status
   remote=model_status();_cache['provider']='Quant-AI T4';_cache['qwen']={'server_available':remote['available'],'resident':[],'status':'Remoto · T4' if remote['available'] else 'Remoto sin conexión'};_cache['laya']={'available':remote['available'],'status':'Remoto · multilingual' if remote['available'] else 'Remoto sin conexión'}
  _stamp=time.monotonic();return dict(_cache)

def release_models(home):
 global _stamp
 from . import remote_ai
 if remote_ai.enabled():
  gc.collect();_stamp=0
  return {'message':'Qwen y LAYA corren en la T4 remota. No hay pesos locales que descargar. Estado remoto comprobado; memoria local actualizada.','released':[],'resources':snapshot(home)}
 if not PIPELINE_LOCK.acquire(blocking=False):raise RuntimeError('Hay una petición activa; libera memoria cuando termine')
 released=[];warning=''
 try:
  _stamp=0;before=snapshot(home).get('memory',{}).get('used_gib')
  try:models=ollama('/api/ps',timeout=3).get('models',[])
  except Exception:models=[];warning='Ollama no respondió; no se pudo comprobar la descarga de modelos. '
  for model in models:
   name=model.get('name') or model.get('model')
   if name!=local_model():continue
   ollama('/api/generate',{'model':name,'keep_alive':0},timeout=15);released.append(name)
  deadline=time.monotonic()+15
  while released and any((m.get('name') or m.get('model')) in released for m in ollama('/api/ps',timeout=3).get('models',[])):
   if time.monotonic()>deadline:raise RuntimeError('Ollama aún no confirmó la descarga; vuelve a comprobar el estado')
   time.sleep(.2)
  gc.collect()
 finally:
  PIPELINE_LOCK.release();_stamp=0
 resources=snapshot(home);memory=resources.get('memory',{});after=memory.get('used_gib')
 message=warning+('Modelo de EscoIA descargado. ' if released else 'No había modelos de EscoIA cargados. ')
 if before is not None and after is not None:
  message+=f'Memoria medida: {before:.2f} → {after:.2f} GiB. '
  message+=('Hay margen estimado para Qwen.' if memory['can_load'] else f"Faltan {memory['shortfall_gib']:.2f} GiB para Qwen con su reserva de {memory['reserve_gib']:.2f} GiB. Cierra aplicaciones o usa EscoIA fuera de Codex." if memory.get('pressure')=='Normal' else 'La presión de memoria es alta; espera o cierra aplicaciones.')
 else:message+='No se pudo medir el margen; no se garantiza que el modelo pueda cargar.'
 return {'message':message,'released':released,'before_gib':before,'after_gib':after,'resources':resources}
