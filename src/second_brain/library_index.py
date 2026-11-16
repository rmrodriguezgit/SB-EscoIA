"""Biblioteca del RAG: categorías, estado de indexación, vista previa y búsqueda híbrida con citas."""
import os
from pathlib import Path
from .core import CAREERS,now

SCHEMA='CREATE TABLE IF NOT EXISTS doc_meta(id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,level TEXT NOT NULL,subject TEXT NOT NULL,doc_type TEXT NOT NULL,updated TEXT NOT NULL)'
LEVELS=('Licenciatura','Maestría','Doctorado','Bachillerato','Educación continua','Sin nivel')
DOC_TYPES=('Plan de estudios','Bibliografía base','Normativa','Guía docente','Otro')

def init(b):b.db.execute(SCHEMA);b.db.commit()

def _guess_type(name):
 n=name.lower()
 if any(k in n for k in ('plan','programa','mapa curricular','temario')):return 'Plan de estudios'
 if any(k in n for k in ('reglamento','normativ','lineamiento','acuerdo')):return 'Normativa'
 if 'guía' in n or 'guia' in n:return 'Guía docente'
 return 'Otro'

def status(b):
 """Por documento: fragmentos, embeddings activos del modelo configurado, peso en disco y categorías."""
 init(b);model=os.environ.get('BRAIN_EMBED_MODEL','bge-m3')
 rows=b.rows('''SELECT d.id,d.name,d.career,d.pages,d.path,d.date,COUNT(c.id) AS chunks,COUNT(v.id) AS vectors,m.level,m.subject,m.doc_type
  FROM documents d LEFT JOIN chunks c ON c.document_id=d.id LEFT JOIN vectors v ON v.id=c.id AND v.model=? LEFT JOIN doc_meta m ON m.id=d.id
  GROUP BY d.id ORDER BY d.career,d.name''',(model,))
 out=[]
 for r in rows:
  p=Path(r.pop('path'))
  size=p.stat().st_size if p.is_file() else None
  state='sin fragmentos' if not r['chunks'] else 'híbrido (léxico + vectorial)' if r['vectors']==r['chunks'] else 'solo léxico' if not r['vectors'] else f"vectorial parcial ({r['vectors']}/{r['chunks']})"
  out.append({**r,'career_name':CAREERS.get(r['career'],r['career']),'bytes':size,'state':state,
   'level':r['level'] or ('Sin nivel' if r['career'] in ('MULTI','ACADEMICO') else 'Licenciatura'),
   'subject':r['subject'] or '','doc_type':r['doc_type'] or _guess_type(r['name']),'categorized':bool(r['doc_type'])})
 total={'documents':len(out),'chunks':sum(d['chunks'] for d in out),'vectors':sum(d['vectors'] for d in out),'bytes':sum(d['bytes'] or 0 for d in out),'model':model}
 return {'documents':out,'total':total,'levels':LEVELS,'doc_types':DOC_TYPES,
  'semantic':'activo' if total['vectors'] else 'inactivo: sin embeddings; la búsqueda usa solo FTS5 (léxica)'}

def set_meta(b,doc_id,level,subject,doc_type):
 init(b)
 if not b.rows('SELECT id FROM documents WHERE id=?',(doc_id,)):raise ValueError('Documento inexistente')
 if level not in LEVELS or doc_type not in DOC_TYPES:raise ValueError('Categoría no válida')
 with b.db:b.db.execute('INSERT OR REPLACE INTO doc_meta VALUES(?,?,?,?,?)',(doc_id,level,str(subject or '').strip()[:160],doc_type,now()))
 return {'id':doc_id,'level':level,'subject':subject,'doc_type':doc_type}

def preview(b,doc_id,limit=6):
 rows=b.rows('SELECT name,career,pages FROM documents WHERE id=?',(doc_id,))
 if not rows:raise ValueError('Documento inexistente')
 chunks=b.rows('SELECT page,substr(text,1,900) AS text FROM chunks WHERE document_id=? ORDER BY page,id LIMIT ?',(doc_id,int(limit)))
 return {**rows[0],'id':doc_id,'chunks':chunks}

def search(b,query,career='',doc_type='',level='',limit=8):
 """Búsqueda híbrida (FTS5 + vectores con fusión RRF cuando hay embeddings) con cita exacta documento · página."""
 from .runtime import hybrid_search
 query=(query or '').strip()
 if not query:raise ValueError('Escribe qué buscar')
 mode='híbrida'
 try:hits=hybrid_search(b,query,career=career,limit=limit*2)
 except Exception as exc:hits=b.search(query,career=career,limit=limit*2);mode='léxica (vectorial no disponible: '+str(exc)[:120]+')'
 if not b.rows('SELECT id FROM vectors LIMIT 1'):mode='léxica (sin embeddings indexados)'
 meta={r['id']:r for r in status(b)['documents']}
 out=[]
 for h in hits:
  doc=meta.get(h.get('document_id'))
  if doc and ((doc_type and doc['doc_type']!=doc_type) or (level and doc['level']!=level)):continue
  cite=f"{h['name']} · p. {h['page']}" if h.get('name') else (h.get('citation') or f"Memoria · {h.get('source') or ''}")
  out.append({'citation':cite,'text':(h.get('text') or '')[:600],'document_id':h.get('document_id'),'page':h.get('page'),'kind':h.get('kind')})
  if len(out)==limit:break
 return {'mode':mode,'results':out}

def dispatch(b,d):
 action=d.get('action')
 if action=='meta':return set_meta(b,str(d['id']),d.get('level'),d.get('subject'),d.get('doc_type'))
 if action=='preview':return preview(b,str(d['id']))
 if action=='search':return search(b,str(d.get('query') or ''),str(d.get('career') or ''),str(d.get('doc_type') or ''),str(d.get('level') or ''))
 if action=='embed':
  from .runtime import embed_index
  return embed_index(b)
 raise ValueError('Acción de biblioteca no permitida')
