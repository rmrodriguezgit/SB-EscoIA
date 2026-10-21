import argparse,json,os,signal,subprocess,sys,time
from pathlib import Path
from .core import Brain
from .runtime import doctor,model_status,answer,execute_next,embed_index,hybrid_search

def dump(value):print(json.dumps(value,ensure_ascii=False,indent=2))
def main():
    p=argparse.ArgumentParser(prog='brain',description='EscoIA · memoria y planes de estudio locales')
    p.add_argument('--home',help='Directorio de datos e instalación')
    sub=p.add_subparsers(dest='cmd',required=True)
    for name in ['doctor','status','stop','graph']:sub.add_parser(name)
    start=sub.add_parser('start');start.add_argument('--port',type=int,default=8790);start.add_argument('--background',action='store_true')
    for name in ['chat','search','remember','run']:
        s=sub.add_parser(name);s.add_argument('text');s.add_argument('--career',default='')
        if name=='remember':s.add_argument('--type',default='facts');s.add_argument('--id');s.add_argument('--source',default='usuario');s.add_argument('--status',default='confirmado')
        if name=='run':s.add_argument('--queue',action='store_true')
    s=sub.add_parser('forget');s.add_argument('id')
    s=sub.add_parser('sync');s.add_argument('zip',nargs='?');s.add_argument('--embeddings',action='store_true')
    for name in ['backup','restore']:s=sub.add_parser(name);s.add_argument('directory')
    s=sub.add_parser('cancel');s.add_argument('id')
    s=sub.add_parser('benchmark');s.add_argument('--model',default='qwen2.5:3b-instruct-q4_K_M');s.add_argument('--query',default='Explica en español qué es el riesgo actuarial.')
    s=sub.add_parser('voice');s.add_argument('audio',nargs='?');s.add_argument('--say')
    sub.add_parser('mcp')
    args=p.parse_args();b=Brain(args.home)
    try:
        if args.cmd=='doctor':dump(doctor())
        elif args.cmd=='status':dump({'model':model_status(),'library':b.library(),'tasks':b.rows('SELECT status,count(*) count FROM tasks GROUP BY status')})
        elif args.cmd=='chat':dump(answer(b,args.text,args.career))
        elif args.cmd=='search':dump(hybrid_search(b,args.text,args.career))
        elif args.cmd=='remember':dump(b.remember(args.text,kind=args.type,memory_id=args.id,source=args.source,status=args.status))
        elif args.cmd=='forget':dump(b.forget(args.id))
        elif args.cmd=='sync':
            if args.zip:
                if Path(args.zip).suffix.lower()=='.json':
                    from .academic_json import install_json
                    dump(install_json(b,args.zip))
                else:dump(b.ingest_zip(args.zip))
            if args.embeddings:dump(embed_index(b))
            if not args.zip and not args.embeddings:dump({'library':b.library()})
        elif args.cmd=='graph':dump(b.rows('SELECT origin,target,relation,source,status FROM edges LIMIT 1000'))
        elif args.cmd=='run':
            tid=b.enqueue(args.text);dump({'id':tid})
            if not args.queue:dump(execute_next(b))
        elif args.cmd=='cancel':b.cancel(args.id);dump({'cancelled':args.id})
        elif args.cmd=='backup':dump({'path':b.backup(args.directory)})
        elif args.cmd=='restore':dump(b.restore(args.directory))
        elif args.cmd=='benchmark':
            from .runtime import ollama,assert_resources
            assert_resources()
            os.environ['BRAIN_MODEL']=args.model;records=[]
            for label in ['fría','caliente']:
                t=time.monotonic();r=ollama('/api/generate',{'model':args.model,'prompt':args.query,'stream':False,'keep_alive':'2m','options':{'num_ctx':4096,'num_predict':150,'temperature':0}})
                records.append({'phase':label,'seconds':time.monotonic()-t,'load_ns':r.get('load_duration'),'eval_count':r.get('eval_count'),'eval_ns':r.get('eval_duration'),'response':r.get('response'),'resources':doctor()})
            ollama('/api/generate',{'model':args.model,'keep_alive':0});dump(records)
            (b.home/'benchmarks').mkdir(exist_ok=True);(b.home/'benchmarks/latest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
        elif args.cmd=='voice':
            if args.say:subprocess.run(['say','-v','Paulina (Español (México))',args.say],check=True)
            elif args.audio:
                binary=os.environ.get('WHISPER_BIN');model=os.environ.get('WHISPER_MODEL')
                if not binary or not model:raise ValueError('Configura WHISPER_BIN y WHISPER_MODEL; consulta docs/integrations.md')
                result=subprocess.run([binary,model,str(Path(args.audio).resolve())],capture_output=True,text=True,check=True,timeout=60);print(result.stdout)
            else:raise ValueError('Indica audio float32 mono 16 kHz o --say TEXTO')
        elif args.cmd=='mcp':
            from .mcp import serve_mcp
            serve_mcp(b)
        elif args.cmd=='start':
            from .server import serve
            if args.background:
                pidfile=b.home/'data/server.pid'
                if pidfile.exists():
                    try:os.kill(int(pidfile.read_text()),0);raise ValueError('Ya hay un servicio registrado')
                    except ProcessLookupError:pidfile.unlink()
                log=open(b.home/'data/server.log','a');proc=subprocess.Popen([sys.executable,'-m','second_brain','--home',str(b.home),'start','--port',str(args.port)],stdout=log,stderr=log,start_new_session=True);pidfile.write_text(str(proc.pid));dump({'pid':proc.pid,'url':f'http://127.0.0.1:{args.port}'})
            else:serve(b.home,args.port)
        elif args.cmd=='stop':
            pidfile=b.home/'data/server.pid'
            if not pidfile.exists():raise ValueError('No hay un servicio registrado. Si está en primer plano usa Ctrl+C')
            pid=int(pidfile.read_text());os.kill(pid,signal.SIGTERM);pidfile.unlink();dump({'stopped':pid})
    except Exception as e:print('Error: '+str(e),file=sys.stderr);raise SystemExit(1)
    finally:b.close()
