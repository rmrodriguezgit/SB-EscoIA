# Persistencia y RAG local. Documentos son evidencia, nunca instrucciones.
import hashlib, json, math, os, re, sqlite3, subprocess, tempfile, unicodedata, uuid, zipfile
from pathlib import Path
from datetime import datetime, timezone

CAREERS = {'LAR':'Actuaría','LAN':'Administración de Negocios','LCP':'Contaduría Pública','LNI':'Negocios Internacionales','LNV':'Negocios Digitales','LTH':'Recursos Humanos'}
def now(): return datetime.now(timezone.utc).isoformat()
def identifier(): return uuid.uuid4().hex
def normal(text): return ''.join(c for c in unicodedata.normalize('NFD',text.lower()) if unicodedata.category(c)!='Mn')
def atomic(path,content):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix('.tmp'); tmp.write_text(content,encoding='utf8'); os.chmod(tmp,0o600); tmp.replace(path)

class Brain:
    def __init__(self,home=None):
        self.home=Path(home or os.environ.get('BRAIN_HOME') or Path(__file__).resolve().parents[2]).resolve()
        (self.home/'data').mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(self.home/'data/brain.sqlite',timeout=10)
        self.db.row_factory=sqlite3.Row
        self.db.executescript('''PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
        CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,text TEXT NOT NULL,source TEXT NOT NULL,date TEXT NOT NULL,type TEXT NOT NULL,sensitivity TEXT NOT NULL,status TEXT NOT NULL,project TEXT NOT NULL,reference TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,hash TEXT UNIQUE NOT NULL,name TEXT NOT NULL,career TEXT NOT NULL,path TEXT NOT NULL,pages INTEGER NOT NULL,date TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS chunks(id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,page INTEGER NOT NULL,text TEXT NOT NULL,hash TEXT NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED,kind UNINDEXED,text,tokenize='unicode61 remove_diacritics 2');
        CREATE TABLE IF NOT EXISTS vectors(id TEXT PRIMARY KEY,model TEXT NOT NULL,values_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS academic_records(id TEXT PRIMARY KEY,career TEXT,code TEXT,name TEXT,semester INTEGER,record_json TEXT,document_id TEXT REFERENCES documents(id));
        CREATE TABLE IF NOT EXISTS edges(id TEXT PRIMARY KEY,origin TEXT NOT NULL,target TEXT NOT NULL,relation TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,objective TEXT NOT NULL,agent TEXT NOT NULL,status TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,checkpoint TEXT NOT NULL DEFAULT '{}',result TEXT,error TEXT,deadline_seconds INTEGER NOT NULL DEFAULT 120);
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,task_id TEXT,at TEXT NOT NULL,state TEXT NOT NULL,message TEXT NOT NULL);
        PRAGMA user_version=1;''')
        os.chmod(self.home/'data/brain.sqlite',0o600)
        # La biblioteca sigue funcionando al mover o descomprimir el proyecto.
        for row in self.rows('SELECT id,hash,path,career FROM documents'):
            suffix='.json' if row['career']=='ACADEMICO' else (Path(row['path']).suffix or '.pdf')
            local=self.home/'data/sources'/(row['hash']+suffix)
            if local.exists() and str(local)!=row['path']:
                self.db.execute('UPDATE documents SET path=? WHERE id=?',(str(local),row['id']))
        self.db.commit()
    def close(self): self.db.close()
    def rows(self,sql,args=()): return [dict(r) for r in self.db.execute(sql,args)]
    def event(self,task,state,message): self.db.execute('INSERT INTO events(task_id,at,state,message) VALUES(?,?,?,?)',(task,now(),state,message)); self.db.commit()
    def remember(self,text,source='usuario',kind='facts',project='',reference='',status='confirmado',sensitivity='privado',memory_id=None):
        if kind not in {'facts','preferences','projects','decisions','daily','sessions','inbox'}: raise ValueError('Tipo de recuerdo no válido')
        if status not in {'confirmado','inferido','pendiente','obsoleto'}: raise ValueError('Estado no válido')
        if not text.strip() or len(text)>20000: raise ValueError('Recuerdo vacío o demasiado largo')
        if re.search(r'(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|(?:password|contraseña|api_key|access_token)\s*[:=]\s*\S+)',text,re.I):
            raise ValueError('No se guardan credenciales ni tokens en memoria')
        mid=memory_id or identifier()
        if memory_id:
            old=self.rows('SELECT * FROM memories WHERE id=?',(mid,))
            if not old: raise ValueError('Recuerdo inexistente')
            for p in (self.home/'memory').glob('*/'+mid+'.json'): p.unlink()
        value=dict(id=mid,text=text,source=source,date=now(),type=kind,sensitivity=sensitivity,status=status,project=project,reference=reference)
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO memories VALUES(:id,:text,:source,:date,:type,:sensitivity,:status,:project,:reference)',value)
            self.db.execute('DELETE FROM search WHERE id=?',(mid,)); self.db.execute('DELETE FROM vectors WHERE id=?',(mid,))
            self.db.execute('DELETE FROM edges WHERE origin=? OR target=?',(mid,mid))
            if status!='obsoleto': self.db.execute('INSERT INTO search VALUES(?,?,?)',(mid,'memory',text))
        atomic(self.home/'memory'/kind/(mid+'.json'),json.dumps(value,ensure_ascii=False,indent=2))
        return value
    def forget(self,mid):
        with self.db:
            self.db.execute('DELETE FROM search WHERE id=?',(mid,));self.db.execute('DELETE FROM vectors WHERE id=?',(mid,));self.db.execute('DELETE FROM memories WHERE id=?',(mid,));self.db.execute('DELETE FROM edges WHERE origin=? OR target=?',(mid,mid))
        for p in (self.home/'memory').glob('*/'+mid+'.json'): p.unlink()
        return {'forgotten':mid}
    def ingest_zip(self,path):
        from concurrent.futures import ThreadPoolExecutor
        imported=[]; skipped=[];pending=[]
        known={r['hash'] for r in self.rows('SELECT hash FROM documents')}
        def commit(item):
            name,career,docid,digest,target,future=item
            proc=future.result();pages=proc.stdout.decode('utf8').split('\f')
            if pages[-1].strip()=='':pages.pop()
            if not any(p.strip() for p in pages):target.unlink();raise ValueError('PDF sin texto; requiere OCR: '+name)
            with self.db:
                self.db.execute('INSERT INTO documents VALUES(?,?,?,?,?,?,?)',(docid,digest,name,career,str(target),len(pages),now()))
                for page,text in enumerate(pages,1):
                    clean=re.sub(r'[ \t]+',' ',text).strip()
                    for start in range(0,len(clean),1500):
                        chunk=clean[start:start+1700];cid=identifier()
                        self.db.execute('INSERT INTO chunks VALUES(?,?,?,?,?)',(cid,docid,page,chunk,hashlib.sha256(chunk.encode()).hexdigest()))
                        self.db.execute('INSERT INTO search VALUES(?,?,?)',(cid,'document',chunk))
                        self.db.execute('INSERT INTO edges VALUES(?,?,?,?,?,?)',(identifier(),cid,career,'pertenece_a',name,'confirmado'))
            imported.append({'name':name,'career':career,'pages':len(pages)})
        with zipfile.ZipFile(path) as z, ThreadPoolExecutor(max_workers=2,thread_name_prefix='escoia-pdf') as pool:
            infos=z.infolist()
            if len(infos)>500 or sum(i.file_size for i in infos)>100*1024**2: raise ValueError('ZIP demasiado grande')
            for i in infos:
                parts=Path(i.filename).parts
                if i.filename.startswith('/') or '..' in parts or '\\' in i.filename or ((i.external_attr>>16)&0o170000)==0o120000: raise ValueError('Ruta ZIP no permitida')
                if not i.filename.lower().endswith('.pdf'): continue
                if i.file_size>20*1024**2: raise ValueError('PDF demasiado grande')
                data=z.read(i); digest=hashlib.sha256(data).hexdigest()
                if digest in known: skipped.append(Path(i.filename).name);continue
                name=Path(i.filename).name
                match=re.search(r'\b(LAR|LAN|LCP|LNI|LNV|LTH)\b',name.upper())
                career=match.group(1) if match else 'OTRA'
                docid=identifier(); target=self.home/'data'/'sources'/(digest+'.pdf');target.parent.mkdir(exist_ok=True);target.write_bytes(data);os.chmod(target,0o600)
                known.add(digest)
                future=pool.submit(subprocess.run,['pdftotext','-layout',str(target),'-'],capture_output=True,timeout=45,check=True)
                pending.append((name,career,docid,digest,target,future))
                if len(pending)==2:
                    for item in pending:commit(item)
                    pending=[]
            for item in pending:commit(item)
        return {'imported':imported,'skipped':skipped}
    def library(self):
        return [dict(code=code,name=CAREERS.get(code,code),documents=rows) for code in sorted({d['career'] for d in self.rows('SELECT career FROM documents') if d['career']!='MULTI'}) for rows in [self.rows("SELECT id,name,pages,date FROM documents WHERE career=? OR career='MULTI' ORDER BY name",(code,))]]
    def search(self,query,career='',project='',source='',since='',limit=8):
        tokens=re.findall(r'[\w]+',query,flags=re.UNICODE)[:24]
        stop={'dame','todas','todos','las','los','del','por','para','una','uno','que','con','materias','carrera','quiero','saber'}
        tokens=[t for t in tokens if len(t)>2 and normal(t) not in stop]
        if not tokens: return []
        code=re.search(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)\d{3}\b',query.upper())
        if code:tokens=[code.group(0)]
        expression=' OR '.join('"'+t+'"' for t in tokens)
        rows=self.rows('''SELECT s.id,s.kind,s.text,bm25(search) score,d.id document_id,d.name,COALESCE(a.career,d.career) career,c.page,m.source,m.date,m.project,m.reference FROM search s LEFT JOIN chunks c ON c.id=s.id LEFT JOIN documents d ON d.id=c.document_id LEFT JOIN memories m ON m.id=s.id LEFT JOIN academic_records a ON a.id=s.id WHERE search MATCH ? AND (?=0 OR s.kind='document') AND (?='' OR COALESCE(a.career,d.career)=? OR s.kind='memory') AND (?='' OR m.project=?) AND (?='' OR COALESCE(m.source,d.name) LIKE ?) AND (?='' OR COALESCE(m.date,d.date)>=?) ORDER BY score LIMIT ?''',(expression,int(bool(code)),career,career,project,project,source,'%'+source+'%',since,since,min(max(limit,1),30)))
        for r in rows:
            r['citation']=f"{r['name']}, página {r['page']}" if r['kind']=='document' and r['page'] else f"{r['name']} · registro JSON" if r['kind']=='document' else f"Memoria {r['id'][:8]} · {r['source']} · {r['date'][:10]}"
        return rows
    def enqueue(self,objective,agent='investigador'):
        if len(objective)>12000 or not objective.strip(): raise ValueError('Objetivo no válido')
        if agent not in {'coordinador','memoria','rag','investigador','evaluador'}: raise ValueError('Agente no permitido')
        tid=identifier();stamp=now()
        self.db.execute('INSERT INTO tasks(id,objective,agent,status,created,updated) VALUES(?,?,?,?,?,?)',(tid,objective,agent,'pendiente',stamp,stamp));self.db.commit();self.event(tid,'pendiente','Tarea en cola');return tid
    def recover(self):
        self.db.execute("UPDATE tasks SET status='pendiente',updated=? WHERE status='ejecutándose'",(now(),));self.db.commit()
    def cancel(self,tid):
        self.db.execute("UPDATE tasks SET status='cancelada',updated=? WHERE id=? AND status IN ('pendiente','ejecutándose','esperando intervención')",(now(),tid));self.db.commit();self.event(tid,'cancelada','Cancelación solicitada')
    def backup(self,destination):
        import shutil
        dest=Path(destination).resolve()
        if dest.exists(): raise ValueError('El destino ya existe')
        dest.mkdir(parents=True);os.chmod(dest,0o700)
        out=sqlite3.connect(dest/'brain.sqlite');self.db.backup(out);out.close()
        for name in ['memory','data/sources']:
            src=self.home/name
            if src.exists(): shutil.copytree(src,dest/name)
        atomic(dest/'manifest.json',json.dumps({'version':1,'date':now(),'database':'brain.sqlite'}))
        return str(dest)
    def restore(self,backup):
        import shutil
        source=Path(backup).resolve()
        if not (source/'manifest.json').exists(): raise ValueError('Respaldo inválido')
        if self.rows('SELECT id FROM memories LIMIT 1') or self.rows('SELECT id FROM documents LIMIT 1') or self.rows('SELECT id FROM tasks LIMIT 1'): raise ValueError('Restaurar requiere un directorio BRAIN_HOME vacío; conserva tu instalación actual')
        original=sqlite3.connect(source/'brain.sqlite');original.backup(self.db);original.close()
        for name in ['memory','data/sources']:
            if (source/name).exists(): shutil.copytree(source/name,self.home/name,dirs_exist_ok=True)
        for d in self.rows('SELECT id,path,hash FROM documents'):
            self.db.execute('UPDATE documents SET path=? WHERE id=?',(str(self.home/'data/sources'/(d['hash']+Path(d['path']).suffix)),d['id']))
        self.db.commit();return {'restored':str(source)}
