"""Ingesta curricular JSON incremental con procedencia PDF y conflictos explícitos."""
import copy,hashlib,json,re
from pathlib import Path
from .core import normal,now,atomic
from .knowledge import build_courses
CODES={'actuaria':'LAR','lan':'LAN','lcp':'LCP','lnd':'LNV','lni':'LNI','rrhh':'LTH'}
def key(text):
    words=re.findall(r'\w+',normal(text).replace('transnacionales','trasnacionales').replace('culturalizacion','culturizacion'))
    return ''.join(w for w in words if w not in {'la','el','los','las','de','del'})

def sections(text):
    clean=re.sub(r'\[Página \d+\]|^Anexo 3\s*$|^\s*\d+\s*$', '',text,flags=re.M)
    headings=[('objetivo',r'FINES DE APRENDIZAJE O FORMACIÓN'),('contenido_tematico',r'CONTENIDO TEMÁTICO'),('actividades_academico',r'ACTIVIDADES DE APRENDIZAJE\s+BAJO CONDUCCIÓN DE UN ACADÉMICO'),('actividades_independientes',r'ACTIVIDADES DE APRENDIZAJE\s+INDEPENDIENTES'),('evaluacion',r'CRITERIOS DE EVALUACIÓN'),('modalidades_tecnologicas',r'MODALIDADES TECNOLÓGICAS E INFORMÁTICAS'),('bibliografia',r'BIBLIOGRAFÍA|REFERENCIAS BIBLIOGRÁFICAS')]
    matches=sorted((m.start(),m.end(),name) for name,pattern in headings for m in re.finditer(r'^[ \t]*(?:'+pattern+r')[ \t]*$',clean,re.I|re.M))
    result={name:None for name,_ in headings}
    for i,(start,end,name) in enumerate(matches):result[name]=clean[end:matches[i+1][0] if i+1<len(matches) else len(clean)].strip()
    result['unidades']=[]
    content=result.get('contenido_tematico') or ''
    for match in re.finditer(r'^([IVX]+)\.?\s+(.+?)(?=^[IVX]+\.?\s+|\Z)',content,re.M|re.S):
        body=match[2].strip();lines=body.splitlines();title=[];topics=[]
        for line in lines:
            m=re.match(r'(\d+(?:\.\d+)+)\s+(.+)',line.strip())
            if m:topics.append({'numero':m[1],'texto':m[2]})
            elif topics:topics[-1]['texto']+=' '+line.strip()
            else:title.append(line.strip())
        result['unidades'].append({'numero':match[1],'titulo':' '.join(title),'temas_y_subtemas':topics})
    return result

def install_json(brain,path):
    path=Path(path);raw=path.read_bytes()
    if len(raw)>10*1024**2:raise ValueError('JSON demasiado grande')
    original=json.loads(raw);programs=original.get('programas')
    if not isinstance(programs,dict) or not programs:raise ValueError('Se requiere programas por carrera')
    build_courses(brain)
    pdfs=brain.rows('SELECT c.*,d.name filename FROM courses c JOIN documents d ON d.id=c.document_id')
    source_hash=hashlib.sha256(raw).hexdigest()
    result={'_meta':{'nombre':'EscoIA — catálogo curricular reconciliado','version':'3.0','fecha':now(),'fuente_json':path.name,'sha256_original':source_hash,'politica':'PDF prioritario para clave, nombre, semestre y temario. Valores JSON sin cotejo PDF permanecen provisionales. Optativas sin clave usan identificador interno OPT. Horas semanales son estimaciones.'},'programas':{},'programas_pdf_sin_fila_json':[],'programas_idiomas_pdf':[]}
    audit={'por_carrera':{},'conflictos':[],'advertencias_originales':original.get('_meta',{}).get('cambios_v2_1',[])}
    matched=set();total=0
    for name,program in programs.items():
        if name not in CODES:raise ValueError('Carrera no reconocida: '+name)
        career=CODES[name];out=copy.deepcopy(program);out['codigo_carrera']=career
        candidates=[c for c in pdfs if c['career']==career]
        count_pdf=0;missing=[];declared_credit=0
        seen=set()
        for semester in out['semestres']:
            sn=semester['semestre']
            if not isinstance(sn,int) or not 1<=sn<=8:raise ValueError('Semestre inválido')
            for subject in semester['materias']:
                code=subject['clave'];title=subject['nombre']
                if code in seen:raise ValueError('Clave duplicada: '+code)
                seen.add(code)
                for field in ['hc','hi','creditos']:
                    value=subject.get(field)
                    if not isinstance(value,(int,float)) or isinstance(value,bool) or value<0:raise ValueError('Valor inválido en '+code+' '+field)
                total+=1;declared_credit+=subject['creditos']
                bycode=next((c for c in candidates if c['code']==code),None)
                byname=[c for c in candidates if key(c['name'])==key(title)]
                course=bycode if bycode and key(bycode['name'])==key(title) else byname[0] if len(byname)==1 else None
                subject['procedencia_mapa']={'archivo':path.name,'puntero':f'/programas/{name}/semestres/{sn-1}/materias/{semester["materias"].index(subject)}','estado':'aportado_por_usuario'}
                subject['horas_semanales_estimadas_16_semanas']={'con_academico':subject['hc']/16,'independientes':subject['hi']/16,'estado':'calculado_no_horario'}
                subject['observaciones']=[]
                if bycode and key(bycode['name'])!=key(title):
                    conflict={'carrera':career,'clave_json':code,'nombre_json':title,'nombre_pdf_en_esa_clave':bycode['name'],'clave_pdf_por_nombre':course['code'] if course else None,'tipo':'nombre_clave_no_coinciden'}
                    audit['conflictos'].append(conflict);subject['observaciones'].append(conflict)
                if not course and bycode and 'lengua extranjera' in normal(title):
                    subject['clave']=career+'OPT'+str(sn)
                    subject['clave_estado']='identificador_interno_sin_clave_pdf'
                    subject['observaciones']=[]
                    subject['reconciliacion_pdf']={'clave_json_original':code,'motivo':'Optativa sin clave propia; no reutilizar clave de otra materia PDF'}
                if course:
                    subject['reconciliacion_pdf']={'clave_json_original':code,'nombre_json_original':title,'semestre_json_original':sn,'politica':'PDF prioritario'}
                    subject['clave']=course['code'];subject['nombre']=course['name']
                    subject['semestre_pdf']=course['semester']
                    subject['observaciones']=[]
                    subject.pop('clave_pdf_por_nombre',None)
                    if course['code']!=code:
                        subject['reconciliacion_pdf']['corregida_desde_pdf']=True
                    if course['semester']!=sn:
                        audit['conflictos'].append({'carrera':career,'clave':subject['clave'],'tipo':'semestre_discrepante','json':sn,'pdf':course['semester']})
                    matched.add(course['id']);count_pdf+=1
                    subject['programa_asignatura']=sections(course['text'])
                    subject['programa_asignatura']['texto_original']=course['text']
                    subject['fuente_pdf']={'document_id':course['document_id'],'archivo':course['filename'],'pagina_inicio':course['start_page'],'pagina_fin':course['end_page'],'clave':course['code'],'semestre':course['semester'],'estado':'extraido_pdf'}
                else:
                    subject['programa_asignatura']=None;subject['fuente_pdf']=None;missing.append(code)
        moved=[(sem['semestre'],m) for sem in out['semestres'] for m in sem['materias']]
        for sem in out['semestres']:sem['materias']=[]
        for previous,m in moved:
            target=m.get('semestre_pdf',previous)
            dest=next((sem for sem in out['semestres'] if sem['semestre']==target),None)
            if dest is None:raise ValueError('Semestre PDF no representado: '+str(target))
            dest['materias'].append(m)
        corrected=[m['clave'] for sem in out['semestres'] for m in sem['materias']]
        if len(corrected)!=len(set(corrected)):raise ValueError('Corrección PDF produce claves duplicadas en '+career)
        audit['por_carrera'][career]={'materias_json':sum(len(s['materias']) for s in out['semestres']),'programas_pdf_enlazados':count_pdf,'sin_programa_pdf':missing,'creditos_sumados_json':declared_credit,'totales_semestre_discrepantes':[]}
        for sem in out['semestres']:
            computed={k:sum(m[k] for m in sem['materias']) for k in ['hc','hi','creditos']}
            sem['totales_calculados']=computed
            if sem.get('totales')!=computed:audit['por_carrera'][career]['totales_semestre_discrepantes'].append({'semestre':sem['semestre'],'declarados':sem.get('totales'),'calculados':computed})
        result['programas'][name]=out
    for course in pdfs:
        if course['semester']==0:
            result['programas_idiomas_pdf'].append({'carrera':course['career'],'clave':course['code'],'nombre':course['name'],'fuente_pdf':{'document_id':course['document_id'],'archivo':course['filename'],'pagina_inicio':course['start_page'],'pagina_fin':course['end_page']},'programa_asignatura':sections(course['text'])})
        elif course['id'] not in matched:result['programas_pdf_sin_fila_json'].append({'carrera':course['career'],'clave':course['code'],'nombre':course['name'],'semestre':course['semester'],'fuente_pdf':{'document_id':course['document_id'],'archivo':course['filename'],'pagina_inicio':course['start_page'],'pagina_fin':course['end_page']},'programa_asignatura':sections(course['text'])})
    audit['total_materias_json']=total;audit['programas_pdf_sin_fila_json']=len(result['programas_pdf_sin_fila_json'])
    audit['programas_idiomas_pdf']=len(result['programas_idiomas_pdf'])
    audit['bibliografias_pdf_disponibles']=sum(bool(sections(c['text'])['bibliografia']) for c in pdfs)
    visual=brain.home/'data/academic/verificaciones_mapa.json'
    if visual.exists():
        verification=json.loads(visual.read_text())
        if brain.rows('SELECT id FROM documents WHERE hash=?',(verification['sha256'],)):
            audit['verificaciones_visuales_pdf']=verification
    result['_auditoria']=audit
    output=brain.home/'data/academic/bd_planes_escoia_completa.json';atomic(output,json.dumps(result,ensure_ascii=False,indent=2))
    # Índice completo por materia, no un único bloque de 160 KB.
    brain.db.execute('CREATE TABLE IF NOT EXISTS academic_records(id TEXT PRIMARY KEY,career TEXT,code TEXT,name TEXT,semester INTEGER,record_json TEXT,document_id TEXT REFERENCES documents(id))')
    digest=hashlib.sha256(output.read_bytes()).hexdigest();docid='academic-'+source_hash[:24]
    target=brain.home/'data/sources'/(digest+'.json');atomic(target,output.read_text())
    with brain.db:
        oldids=[r['id'] for r in brain.rows('SELECT id FROM academic_records')]
        for rid in oldids:brain.db.execute('DELETE FROM search WHERE id=?',(rid,));brain.db.execute('DELETE FROM vectors WHERE id=?',(rid,))
        brain.db.execute('DELETE FROM academic_records')
        brain.db.execute('DELETE FROM chunks WHERE document_id=?',(docid,))
        brain.db.execute('INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?,?,?)',(docid,digest,'bd_planes_escoia_completa.json','MULTI',str(target),0,now()))
        for program in result['programas'].values():
            career=program['codigo_carrera']
            for semester in program['semestres']:
                for subject in semester['materias']:
                    rid=hashlib.sha256((docid+career+subject['clave']+str(semester['semestre'])).encode()).hexdigest()
                    text=record_text(subject,semester['semestre'])
                    brain.db.execute('INSERT INTO academic_records VALUES(?,?,?,?,?,?,?)',(rid,career,subject['clave'],subject['nombre'],semester['semestre'],json.dumps(subject,ensure_ascii=False),docid))
                    brain.db.execute('INSERT INTO chunks VALUES(?,?,?,?,?)',(rid,docid,0,text,hashlib.sha256(text.encode()).hexdigest()))
                    brain.db.execute('INSERT INTO search VALUES(?,?,?)',(rid,'document',text))
    return {'output':str(output),'document_id':docid,'audit':audit}

def record_text(subject,semester):
    text=f"{subject['clave']} — {subject['nombre']}. Semestre {semester}. Tipo: {subject['tipo']}. Área: {subject['area']}. Horas con académico por semestre: {subject['hc']}. Horas independientes por semestre: {subject['hi']}. Créditos: {subject['creditos']}. Instalación: {subject['instalacion']}."
    text+=f" Estimación bajo supuesto de 16 semanas: {subject['hc']/16:g} h/semana con académico y {subject['hi']/16:g} independientes; no es horario confirmado."
    program=subject.get('programa_asignatura')
    if program:
        text+='\nObjetivo: '+(program['objetivo'] or '')+'\nContenido temático: '+(program['contenido_tematico'] or '')
    if subject.get('observaciones'):text+='\nDiscrepancias: '+json.dumps(subject['observaciones'],ensure_ascii=False)
    return text

def academic_evidence(brain,question,career):
    if not brain.rows("SELECT name FROM sqlite_master WHERE name='academic_records'"):return None
    q=normal(question);m=re.search(r'\b(?:LAR|LAN|LCP|LNI|LNV|LTH)[A-Z0-9]{3,}\b',question.upper())
    semester=next((v for k,v in {'primer':1,'segundo':2,'tercer':3,'cuarto':4,'quinto':5,'sexto':6,'septimo':7,'octavo':8}.items() if k in q and 'semestre' in q),None)
    if not semester:
        num=re.search(r'(?:semestre\s*(\d{1,2})\b|\b(\d{1,2})(?:er|ro|do|to|mo|vo|no|º|°|o)?\s*semestre)',q);semester=int(num[1] or num[2]) if num else None
    if m:
        rows=brain.rows('SELECT * FROM academic_records WHERE code=?',(m[0],))
        intent='subject'
    elif career and semester:rows=brain.rows('SELECT * FROM academic_records WHERE career=? AND semester=? ORDER BY rowid',(career,semester));intent='semester'
    elif career and any(t in q for t in ['materias','asignaturas','carga','creditos','horas','plan de estudios','mapa curricular']):rows=brain.rows('SELECT * FROM academic_records WHERE career=? ORDER BY semester,rowid',(career,));intent='career'
    else:
        rows=brain.rows('SELECT * FROM academic_records WHERE (?="" OR career=?)',(career,career));rows=[r for r in rows if key(r['name']) in key(question)];intent='subject'
    if not rows:return None
    sources=[];records=[]
    for row in rows:
        subject=json.loads(row['record_json']);records.append({**subject,'semestre':row['semester']})
    # Agrupar por semestre evita que el límite de fuentes oculte asignaturas.
    for sn in sorted({r['semester'] for r in rows}):
        group=[r for r in rows if r['semester']==sn]
        text='\n'.join(record_text(json.loads(r['record_json']),sn) for r in group)
        sources.append({'id':group[0]['id'],'document_id':group[0]['document_id'],'kind':'document','name':'bd_planes_escoia_completa.json','page':0,'career':group[0]['career'],'text':text,'citation':f'JSON curricular EscoIA · {group[0]["career"]} · semestre {sn}'})
    return {'intent':intent,'records':records,'sources':sources}

def factual_response(retrieved,question):
    records=retrieved.get('records',[])
    if not records:return None
    q=normal(question);parts=[];semester_source={}
    for i,source in enumerate(retrieved['sources'],1):
        sn=int(re.search(r'semestre (\d+)',source['citation'])[1]);semester_source[sn]=i
    if retrieved['intent']=='subject' and any(t in q for t in ['temas','temario','unidad','subtema','objetivo','contenido','evaluacion','actividades','bibliograf']):
        for r in records:
            p=r.get('programa_asignatura');citation=f'[{semester_source[r["semestre"]]}]'
            if not p:parts.append(f'{r["clave"]} — {r["nombre"]}: el mapa tiene esta materia, pero falta su programa desarrollado en los PDF disponibles. {citation}');continue
            fields=['contenido_tematico'] if any(t in q for t in ['temas','temario','unidad','subtema','contenido']) else ['bibliografia'] if 'bibliograf' in q else ['evaluacion'] if 'evaluacion' in q else ['actividades_academico','actividades_independientes'] if 'actividades' in q else ['objetivo']
            for field in fields:parts.append(f'{r["clave"]} — {r["nombre"]}\n{field.replace("_"," ").capitalize()}:\n{p.get(field) or "No consta en los PDF aportados; requiere otra fuente."} {citation}')
    else:
        for sn in sorted(semester_source):
            group=[r for r in records if r['semestre']==sn];citation=f'[{semester_source[sn]}]'
            parts.append(f'Semestre {sn}:')
            for r in group:
                parts.append(f'- {r["clave"]} — {r["nombre"]}; {r["hc"]} h con académico y {r["hi"]} h independientes por semestre; {r["creditos"]} créditos. {citation}')
                if 'semana' in q:parts.append(f'  Estimación en 16 semanas: {r["hc"]/16:g} h/semana con académico; {r["hi"]/16:g} independientes. No es un horario confirmado. {citation}')
                if r.get('clave_estado')=='identificador_interno_sin_clave_pdf':parts.append('  La optativa no tiene clave en el PDF; '+r['clave']+' es un identificador interno, no una clave oficial. '+citation)
                for obs in r.get('observaciones',[]):
                    if obs['tipo']=='nombre_clave_no_coinciden':parts.append(f'  Discrepancia: el JSON original usa {obs["clave_json"]} para {obs["nombre_json"]}, mientras el PDF usa esa clave para {obs["nombre_pdf_en_esa_clave"]}. {citation}')
            if len(group)>1:parts.append(f'Total calculado de filas: {sum(r["hc"] for r in group)} h con académico, {sum(r["hi"] for r in group)} h independientes y {sum(r["creditos"] for r in group)} créditos. {citation}')
    return '\n'.join(parts)
