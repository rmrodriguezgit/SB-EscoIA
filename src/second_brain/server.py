import json, mimetypes, os, secrets, threading, time, re
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from .core import Brain
from .runtime import answer,model_status,execute_next

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def send(self,value,status=200):
        data=json.dumps(value,ensure_ascii=False).encode();self.send_response(status);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data)
    def trusted(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
    def do_GET(self):
        if not self.trusted():return self.send({'error':'Host no permitido'},403)
        url=urlparse(self.path);path=url.path
        if path.startswith('/api/'):
            b=Brain(self.server.home)
            try:
                if path=='/api/request-git':
                    try:
                        from . import request_git
                        params=parse_qs(url.query);rid=params.get('id',[''])[0];action=params.get('action',['history'])[0]
                        if action=='diff':return self.send({'diff':request_git.diff(b,rid,params.get('sha',[''])[0])})
                        if action=='artifact':return self.send(request_git.artifact(b,rid,params.get('name',[''])[0]))
                        return self.send(request_git.history(b,rid))
                    except FileNotFoundError:return self.send({'error':'Expediente o archivo inexistente'},404)
                    except (ValueError,UnicodeError) as exc:return self.send({'error':str(exc)},400)
                if path=='/api/services':
                    from .services import academic_status
                    return self.send(academic_status())
                if path=='/api/requests':
                    from .request_records import recent
                    return self.send(recent(b))
                if path=='/api/request':
                    from . import request_records
                    params=parse_qs(url.query);rid=params.get('id',[''])[0]
                    try:record=request_records.read(b,rid)
                    except (FileNotFoundError,ValueError):return self.send({'error':'Expediente inexistente'},404)
                    if params.get('format',[''])[0]=='md':
                        data=record['markdown'].encode();self.send_response(200);self.send_header('Content-Type','text/markdown; charset=utf-8');self.send_header('Content-Disposition','attachment; filename="Peticion-'+rid+'.md"');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data);return
                    return self.send(record)
                if path=='/api/research':
                    from .research import init,get
                    init(b);sid=parse_qs(url.query).get('id',[''])[0]
                    return self.send(get(b,sid) if sid else b.rows('SELECT id,title,phase FROM research_studies ORDER BY created DESC'))
                if path=='/api/state':return self.send({'model':model_status(),'inference':__import__('second_brain.inference',fromlist=['status']).status(),'library':b.library(),'memories':b.rows('SELECT * FROM memories ORDER BY date DESC LIMIT 100'),'tasks':b.rows('SELECT * FROM tasks ORDER BY created DESC LIMIT 50'),'events':b.rows('SELECT * FROM events ORDER BY id DESC LIMIT 80'),'resources':__import__('second_brain.resources',fromlist=['snapshot']).snapshot(b.home),'csrf':self.server.token})
                if path=='/api/export':
                    params=parse_qs(url.query);eid=params.get('id',[''])[0];fmt=params.get('format',[''])[0]
                    if not re.fullmatch(r'[a-f0-9]{32}',eid) or fmt not in {'pdf','doc','docx','ipynb','json'}:return self.send({'error':'Archivo inválido'},400)
                    folder=self.server.home/'data/exports'/eid
                    if not (folder/'plan.json').is_file():return self.send({'error':'Programa inexistente'},404)
                    manifest=json.loads((folder/'plan.json').read_text());name=manifest.get('files',{}).get(fmt,'Programa-'+manifest['code']+'.'+fmt);p=folder/name
                    if not p.resolve().is_relative_to(folder.resolve()) or not p.is_file():return self.send({'error':'Archivo inexistente'},404)
                    data=p.read_bytes();types={'json':'application/json','ipynb':'application/x-ipynb+json','pdf':'application/pdf','doc':'application/msword','docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}
                    self.send_response(200);self.send_header('Content-Type',types[fmt]);self.send_header('Content-Disposition','attachment; filename="'+name+'"');self.send_header('Content-Length',str(len(data)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(data);return
                if path=='/api/source':
                    mid=parse_qs(url.query).get('id',[''])[0];rows=b.rows('SELECT path,name FROM documents WHERE id=?',(mid,))
                    if not rows:return self.send({'error':'Fuente inexistente'},404)
                    p=Path(rows[0]['path'])
                    if not p.is_relative_to(self.server.home/'data/sources'):return self.send({'error':'Fuente inválida'},403)
                    data=p.read_bytes();self.send_response(200);self.send_header('Content-Type','application/json; charset=utf-8' if p.suffix=='.json' else 'application/pdf');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
                return self.send({'error':'Ruta inexistente'},404)
            finally:b.close()
        target=self.server.home/'ui/dist'/path.lstrip('/')
        if not target.is_file():target=self.server.home/'ui/dist/index.html'
        if not target.resolve().is_relative_to(self.server.home/'ui/dist'):return self.send({'error':'Ruta inválida'},403)
        if not target.exists():return self.send({'error':'Ejecuta scripts/install.sh para compilar la interfaz'},503)
        self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(target)[0] or 'application/octet-stream');self.send_header('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-src http://127.0.0.1:8787; object-src 'none'; frame-ancestors 'none'");self.end_headers();self.wfile.write(target.read_bytes())
    def do_POST(self):
        origin=self.headers.get('Origin')
        if not self.trusted() or self.headers.get('X-CSRF-Token')!=self.server.token or (origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}):return self.send({'error':'Solicitud no autorizada'},403)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size>(3000000 if self.path=='/api/voice' else 500000 if self.path=='/api/research' else 50000):raise ValueError('Solicitud demasiado grande')
            args=json.loads(self.rfile.read(size));b=Brain(self.server.home)
            try:
                if self.path=='/api/request-git':
                    from . import request_git
                    rid=args['id'];action=args['action']
                    if action=='review':
                        from .document_reviews import review
                        return self.send(review(b,rid,args['name'],args['head'],args.get('revision')))
                    if action=='rollback':return self.send(request_git.rollback(b,rid,args['sha'],args['head']))
                    if action=='artifact':return self.send(request_git.artifact(b,rid,args['name'],args['text'],args['head']))
                    if action=='reuse':return self.send(request_git.reuse(b,rid,args['head']))
                    if action in {'delete','restore'}:return self.send(request_git.archive(b,rid,args['head'],action=='delete'))
                    if action=='forget':return self.send(request_git.remove(b,rid,args['head'],args['confirmation']))
                    raise ValueError('Operación Git inválida')
                if self.path=='/api/services/reconnect':
                    from .services import recover_academic
                    return self.send(recover_academic(self.server.home))
                if self.path=='/api/inference':
                    from .inference import select,select_model
                    return self.send(select_model(args['model']) if 'model' in args else select(args['mode']))
                if self.path=='/api/request':
                    from . import request_records
                    if args.get('action')=='verify':return self.send(request_records.recheck(b,args['id']))
                    return self.send(request_records.edit(b,args['id'],args['markdown'],args['revision']))
                if self.path=='/api/research':
                    from .research import dispatch
                    return self.send(dispatch(b,args))
                if self.path=='/api/resources/release':
                    from .resources import release_models
                    return self.send(release_models(b.home))
                if self.path=='/api/voice':
                    from .voice import transcribe
                    return self.send(transcribe(b.home,args['pcm']))
                if self.path=='/api/chat':
                    result=answer(b,args['question'],args.get('career',''),program_metadata=args.get('program'))
                    try:
                        from . import request_records
                        with request_records.LOCK:
                            if request_records._folder(b,result['run_id']).exists():b.remember(args['question']+'\n'+result['text'][:5000],kind='sessions',source='conversación local',status='inferido',reference='request:'+result['run_id'])
                    except ValueError:pass  # Nunca persistir patrones de credenciales.
                    return self.send(result)
                if self.path=='/api/remember':return self.send(b.remember(args['text'],kind=args.get('kind','facts'),memory_id=args.get('id')))
                if self.path=='/api/forget':return self.send(b.forget(args['id']))
                if self.path=='/api/task':return self.send({'id':b.enqueue(args['objective'])})
                if self.path=='/api/cancel':b.cancel(args['id']);return self.send({'cancelled':args['id']})
                return self.send({'error':'Ruta inexistente'},404)
            finally:b.close()
        except Exception as e:
            rid=getattr(e,'request_record_id',None)
            if rid:return self.send({'text':'La petición requiere atención: '+str(e),'run_id':rid,'mode':'Ejecución fallida','validation':{'passed':False,'status':'not_completed'},'request_record':{'id':rid}})
            self.send({'error':str(e)},400)

class BoundedHTTPServer(ThreadingHTTPServer):
    daemon_threads=True
    def __init__(self,*args,**kwargs):
        self.slots=threading.BoundedSemaphore(12);super().__init__(*args,**kwargs)
    def process_request(self,request,client_address):
        if not self.slots.acquire(blocking=False):
            try:request.sendall(b'HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
            finally:self.shutdown_request(request)
            return
        try:super().process_request(request,client_address)
        except BaseException:self.slots.release();raise
    def process_request_thread(self,request,client_address):
        try:super().process_request_thread(request,client_address)
        finally:self.slots.release()

def serve(home,port=8790):
    import fcntl
    lock=open(Path(home)/'data/coordinator.lock','a')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('Ya existe un coordinador activo para este directorio')
    server=BoundedHTTPServer(('127.0.0.1',port),Handler);server.home=Path(home).resolve();server.token=secrets.token_urlsafe(32)
    b=Brain(home);b.recover();from .research import recover;recover(b)
    from .request_records import recover as recover_requests
    recover_requests(b);b.close()
    stop=threading.Event()
    def worker():
        while not stop.wait(1):
            b=Brain(home)
            try:execute_next(b)
            finally:b.close()
    t=threading.Thread(target=worker,daemon=True);t.start()
    print(f'EscoIA: http://127.0.0.1:{port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:stop.set();server.server_close()
