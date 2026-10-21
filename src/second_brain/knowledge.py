"""Índice curricular estructurado: un programa de asignatura completo por tramo de PDF."""
import re, subprocess, difflib
from .core import normal, identifier
SEMESTERS={'primer':1,'segundo':2,'tercer':3,'cuarto':4,'cuatro':4,'quinto':5,'sexto':6,'septimo':7,'octavo':8}

def build_courses(brain):
    brain.db.execute('''CREATE TABLE IF NOT EXISTS courses(id TEXT PRIMARY KEY,document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,career TEXT,code TEXT,name TEXT,semester INTEGER,start_page INTEGER,end_page INTEGER,text TEXT,hours INTEGER,UNIQUE(document_id,code,start_page))''')
    brain.db.execute('CREATE TABLE IF NOT EXISTS rag_metadata(key TEXT PRIMARY KEY,value TEXT)')
    version=brain.rows("SELECT value FROM rag_metadata WHERE key='course_parser'")
    if not version or version[0]['value']!='3':brain.db.execute('DELETE FROM courses')
    count=0
    for doc in brain.rows("SELECT * FROM documents WHERE name LIKE '%Anexo 3%'"):
        if brain.rows('SELECT id FROM courses WHERE document_id=? LIMIT 1',(doc['id'],)):continue
        pages=subprocess.run(['pdftotext','-layout',doc['path'],'-'],capture_output=True,check=True,timeout=45).stdout.decode().split('\f')
        headers=[]
        for n,page in enumerate(pages):
            m=re.search(r'DENOMINACI[ÓO]N DE LA ASIGNATURA O UNIDAD DE APRENDIZAJE\s+(.+?)\s+((?:Primer|Segundo|Tercer|Cuarto|Cuatro|Quinto|Sexto|Séptimo|Octavo)\s+(?:Semestre|Nivel))\s+([A-Z]{2,3}[A-Z0-9]+)',page,re.S|re.I)
            if not m:continue
            title=' '.join(m[1].split());semester=0 if 'nivel' in normal(m[2]) else SEMESTERS[normal(m[2].split()[0])];headers.append((n,m[3].upper(),title,semester))
        for i,(start,code,name,semester) in enumerate(headers):
            end=headers[i+1][0] if i+1<len(headers) else len(pages)-(1 if not pages[-1].strip() else 0)
            text='\n\n'.join(f'[Página {p+1}]\n'+re.sub(r'[ \t]+',' ',pages[p]).strip() for p in range(start,end))
            brain.db.execute('INSERT OR IGNORE INTO courses VALUES(?,?,?,?,?,?,?,?,?,?)',(identifier(),doc['id'],doc['career'],code,name,semester,start+1,end,text,None));count+=1
    brain.db.execute("INSERT OR REPLACE INTO rag_metadata VALUES('course_parser','3')")
    brain.db.commit();return count

def curriculum_evidence(brain,question,career):
    from .academic_json import academic_evidence
    structured=academic_evidence(brain,question,career)
    if structured:return structured
    build_courses(brain)
    q=normal(question);code=re.search(r'\b(?:(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}|(?:IN|FR|IT|AL|JP)[1-8])\b',question.upper())
    params=[];where=''
    if career:where=' AND c.career=?';params=[career]
    courses=brain.rows('SELECT c.*,d.name filename FROM courses c JOIN documents d ON d.id=c.document_id WHERE 1=1'+where,params)
    selected=[];intent='search'
    if code:selected=[c for c in courses if c['code']==code[0]];intent='syllabus'
    else:
        semester=next((v for k,v in SEMESTERS.items() if k in q and 'semestre' in q),None)
        if not semester:
            m=re.search(r'(\d)[º°o]?\s*(?:semestre)',q);semester=int(m[1]) if m else None
        if semester and career:selected=[c for c in courses if c['semester']==semester];intent='semester'
        else:
            matches=[c for c in courses if normal(c['name']) in q]
            if matches:
                longest=max(len(c['name']) for c in matches)
                selected=[c for c in matches if len(c['name'])==longest];intent='syllabus'
    if not selected:return {'intent':intent,'courses':[],'sources':brain.search(question,career=career,limit=6)}
    sources=[]
    for c in selected:
        sources.append({'id':c['id'],'document_id':c['document_id'],'kind':'document','name':c['filename'],'page':c['start_page'],'end_page':c['end_page'],'career':c['career'],'text':c['text'],'citation':f"{c['filename']}, páginas {c['start_page']}–{c['end_page']}"})
    if intent=='semester':
        summary='\n'.join(f"{c['code']} — {c['name']}, semestre {c['semester']}, páginas {c['start_page']}–{c['end_page']}" for c in selected)
        sources=[{**sources[0],'text':'Programas desarrollados en Anexo 3:\n'+summary,'citation':f"{selected[0]['filename']}, páginas {min(c['start_page'] for c in selected)}–{max(c['end_page'] for c in selected)}"}]
        maps=brain.rows("SELECT d.id,d.name,c.page,c.text,c.id chunk_id FROM documents d JOIN chunks c ON c.document_id=d.id WHERE d.career=? AND d.name LIKE '%Anexo 2%' AND c.page=1 ORDER BY c.rowid",(career,))
        if maps:
            sources.append({'id':maps[0]['chunk_id'],'document_id':maps[0]['id'],'kind':'document','name':maps[0]['name'],'page':1,'career':career,'text':'\n'.join(m['text'] for m in maps),'citation':maps[0]['name']+', página 1'})
    return {'intent':intent,'courses':selected,'sources':sources}

def numeric_checks(text,sources):
    # Control adicional: Laya no es fiable por sí solo para contrastar cifras.
    def numbers(value):
        value=re.sub(r'\[\d+\]|\b[A-Z]{2,3}[A-Z0-9]+\b','',value)
        return {n.replace(',','.') for n in re.findall(r'(?<![\w.])\d+(?:[.,]\d+)?(?!\w)',value)}
    catalog={}
    for source in sources:
        for line in source['text'].splitlines():
            code=re.match(r'([A-Z]{2,3}[A-Z0-9]+) — ',line)
            if not code:continue
            fields={}
            for name,label in [('hc','Horas con académico por semestre'),('hi','Horas independientes por semestre'),('creditos','Créditos')]:
                match=re.search(re.escape(label)+r': (\d+(?:\.\d+)?)',line)
                if match:fields[name]=float(match[1])
            if fields:catalog[code[1]]=fields
    active_code=next(iter(catalog)) if len(catalog)==1 else None
    for claim in re.split(r'\n|(?<=[.!?])\s+',text):
        codes=[code for code in catalog if re.search(r'\b'+re.escape(code)+r'\b',claim)]
        if len(codes)==1:active_code=codes[0]
        if not active_code:continue
        fields=catalog[active_code]
        patterns={'hc':r'(\d+(?:[.,]\d+)?)\s*(?:h|horas)\s+(?:con|de)\s+(?:el\s+)?acad[eé]mico','hi':r'(\d+(?:[.,]\d+)?)\s*(?:h|horas)\s+independientes','creditos':r'(\d+(?:[.,]\d+)?)\s+cr[eé]ditos'}
        for name,pattern in patterns.items():
            for match in re.finditer(pattern,claim,re.I):
                value=float(match[1].replace(',','.'));expected=fields.get(name)
                if name!='creditos' and 'semana' in normal(claim):expected=expected/16 if expected is not None else None
                if expected is not None and value!=expected:return {'passed':False,'reason':f'{active_code}: {name} debe ser {expected:g} según el catálogo; el modelo indicó {value:g}'}
    unsupported=numbers(text)-numbers(' '.join(s['text'] for s in sources))
    if unsupported:return {'passed':False,'reason':'Cifra no presente en la evidencia local: '+', '.join(sorted(unsupported))}
    return {'passed':True,'reason':'Las cifras aparecen en la evidencia; esta comprobación no prueba por sí sola su relación semántica'}

def deterministic_checks(text,sources):
    citations=[int(n) for n in re.findall(r'\[(\d+)\]',text)]
    if not citations:return {'passed':False,'reason':'La respuesta no cita las fuentes recuperadas'}
    if any(n<1 or n>len(sources) for n in citations):return {'passed':False,'reason':'Referencia inexistente en la respuesta'}
    available=set(re.findall(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}\b',' '.join(s['text'] for s in sources)))
    used=set(re.findall(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}\b',text))
    if used-available:return {'passed':False,'reason':'Código de asignatura no sustentado: '+', '.join(sorted(used-available))}
    quantitative=numeric_checks(text,sources)
    if not quantitative['passed']:return quantitative
    return {'passed':True,'reason':'Referencias, códigos y presencia de cifras comprobados; Laya aporta revisión probabilística, no certificación'}
