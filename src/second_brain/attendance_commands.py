"""Órdenes explícitas de listas: reglas deterministas, sin inferencia ni RAG curricular."""
import json,re,sqlite3,subprocess,time
from pathlib import Path
from .core import normal

def requested(question):
    q=normal(question)
    return bool(re.search(r'\b(quita|quitar|retira|retirar|elimina|eliminar|borra|borrar|cambia|cambiar|edita|editar|agrega|agregar|inscribe|inscribir|anade)\b',q) and ('lista' in q or 'asistencia' in q) and ('alumno' in q or 'matricula' in q))

def config(home):
    root=Path(home).resolve().parent/'sistema-escolar';values={}
    for line in (root/'.env').read_text().splitlines():
        key,sep,value=line.partition('=')
        if sep and key in {'DATABASE','NATIVE_BIN'}:values[key]=value.strip().strip('"\'')
    return root,(root/values.get('DATABASE','data/sistema.db')).resolve(),(root/values.get('NATIVE_BIN','build/sistema_service')).resolve()

def resolve_target(question,students,offers,teachers):
    q=normal(question)
    group=re.search(r'\b(LAR|LAN|LCP|LNI|LNV|LTH)[- ]?([1-9][01]\d)\b',question.upper())
    if not group:raise ValueError('Indica el grupo completo, por ejemplo LAN-201')
    code=group[1]+'-'+group[2]
    teacher=[t for t in teachers if normal(t['name']) in q]
    if len(teacher)!=1:raise ValueError('Indica el nombre completo del docente para identificar una única lista')
    student=[s for s in students if re.search(r'(?<!\w)'+re.escape(str(s['number']))+r'(?!\w)',question)]
    if len(student)!=1:raise ValueError('Indica una matrícula única del alumno')
    candidates=[o for o in offers if o['group_code']==code and o['teacher_id']==teacher[0]['id']]
    if len(candidates)!=1:raise ValueError('Hay varias listas o períodos posibles: realiza el cambio desde Administrar listas por grupo')
    return student[0],candidates[0],teacher[0]

def read_target(home,question):
    root,path,binary=config(home)
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        db.row_factory=sqlite3.Row
        students=[dict(r) for r in db.execute('SELECT id,number,name FROM students')]
        teachers=[dict(r) for r in db.execute('SELECT id,name FROM teachers')]
        offers=[dict(r) for r in db.execute('SELECT o.*,g.code group_code,s.name subject FROM offerings o JOIN groups g ON g.id=o.group_id JOIN subjects s ON s.id=o.subject_id')]
    return (path,binary,*resolve_target(question,students,offers,teachers))

# Una orden escrita (chat, tarea o MCP) nunca modifica la base: deja una propuesta que una
# persona confirma en la interfaz de EscoIA (POST /api/attendance/decision, protegido con CSRF).
PROPOSAL_TTL=30*60

def _proposals(home):
    folder=Path(home).resolve()/'data/proposals';folder.mkdir(parents=True,exist_ok=True,mode=0o700);return folder

def _proposal_path(home,pid):
    if not re.fullmatch(r'[0-9a-f]{32}',str(pid)):raise ValueError('Propuesta no válida')
    return _proposals(home)/(pid+'.json')

def _save(path,data):
    tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(data,ensure_ascii=False,indent=1));tmp.chmod(0o600);tmp.replace(path)

def execute(brain,question,run):
    if not re.search(r'\b(quita|quitar|retira|retirar|elimina|eliminar|borra|borrar)\b',normal(question)) or not any(word in normal(question) for word in ('lista','grupo')):
        return {'text':'Esta petición corresponde a la administración de listas. Abre Asistencia → Administrar listas por grupo para altas, edición o cambio de grupo; no se ha modificado ningún registro.','sources':[],'mode':'Administración de listas','administrative_guidance':True,'run_id':run}
    path,binary,student,offer,teacher=read_target(brain.home,question)
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        member=db.execute('SELECT 1 FROM enrollments WHERE student_id=? AND offering_id=?',(student['id'],offer['id'])).fetchone()
    operation={'action':'remove','student_id':student['id'],'number':student['number'],'offering_id':offer['id'],'teacher_id':teacher['id'],'group':offer['group_code']}
    if not member:
        brain.event(run,'Administración','El alumno ya no pertenece a la lista; sin cambios')
        return {'text':f"{student['name']} · matrícula {student['number']} ya no pertenece a la lista {offer['group_code']} — {offer['subject']} del docente {teacher['name']}. No se modificó ningún registro.",'sources':[],'mode':'Administración de listas · sin cambios','academic_operation':operation,'run_id':run}
    import uuid
    pid=uuid.uuid4().hex
    summary=f"Retirar a {student['name']} · matrícula {student['number']} de la lista {offer['group_code']} — {offer['subject']} del docente {teacher['name']}"
    _save(_proposal_path(brain.home,pid),{'id':pid,'run_id':run,'question':question,'operation':operation,'summary':summary,'status':'pendiente','created':time.time()})
    brain.event(run,'Administración','Retiro preparado; pendiente de confirmación en la interfaz')
    return {'text':summary+'. Pendiente de confirmación: no se ha modificado ningún registro. Confirma o cancela en EscoIA dentro de 30 minutos.','sources':[],'mode':'Administración de listas · pendiente de confirmación','pending_operation':{'id':pid,'summary':summary},'run_id':run}

def decide(brain,pid,decision):
    """Confirma o cancela una propuesta. Solo se llama desde la interfaz (HTTP con CSRF), nunca desde el MCP ni el modelo."""
    if decision not in {'confirm','reject'}:raise ValueError('Decisión no válida')
    path=_proposal_path(brain.home,pid)
    if not path.exists():raise ValueError('La propuesta no existe')
    data=json.loads(path.read_text())
    if data['status']!='pendiente':raise ValueError('La propuesta ya fue '+data['status'])
    if decision=='reject':
        data.update(status='cancelada',decided=time.time());_save(path,data)
        brain.event(data['run_id'],'Administración','Retiro cancelado por la persona usuaria; sin cambios')
        return {'status':'cancelada','text':'Retiro cancelado. No se modificó ningún registro.'}
    if time.time()-data['created']>PROPOSAL_TTL:
        data.update(status='caducada');_save(path,data);raise ValueError('La propuesta caducó; vuelve a pedir el retiro')
    db_path,binary,student,offer,teacher=read_target(brain.home,data['question'])
    operation={'action':'remove','student_id':student['id'],'number':student['number'],'offering_id':offer['id'],'teacher_id':teacher['id'],'group':offer['group_code']}
    if operation!=data['operation']:raise ValueError('Los datos de la lista cambiaron desde la propuesta; vuelve a pedir el retiro')
    with sqlite3.connect('file:'+str(db_path)+'?mode=ro',uri=True) as db:
        member=db.execute('SELECT 1 FROM enrollments WHERE student_id=? AND offering_id=?',(student['id'],offer['id'])).fetchone()
        actor=db.execute("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
    if not actor:raise ValueError('No se encontró administración local autorizada')
    if member:
        steps=[{'op':'unenroll','params':[student['id'],offer['id']]},{'op':'audit_create','params':[actor[0],'lista-remove-confirmed',str(offer['id']),int(time.time()),json.dumps({'request_id':data['run_id'],'proposal_id':pid,'student_id':student['id'],'number':student['number'],'teacher_id':teacher['id'],'group':offer['group_code']},ensure_ascii=False)]}]
        result=subprocess.run([str(binary),str(db_path)],input=json.dumps({'id':1,'op':'batch','steps':steps})+'\n',capture_output=True,text=True,timeout=15,check=True)
        response=json.loads(result.stdout.strip())
        if not response.get('ok'):raise ValueError(response.get('error','No se modificó la lista'))
    data.update(status='confirmada',decided=time.time());_save(path,data)
    brain.event(data['run_id'],'Administración','Retiro confirmado en la interfaz; lista actualizada y historial conservado')
    outcome={'academic_operation':operation}
    check=verify(brain.home,data['question'],outcome)
    return {'status':'confirmada','verification':check,'text':f"{student['name']} · matrícula {student['number']} fue retirado de la lista {offer['group_code']} — {offer['subject']} del docente {teacher['name']}. Se conservan su biometría y las asistencias anteriores; no se modificaron otras listas."}

def verify(home,question,result):
    if result.get('administrative_guidance'):
        return {'passed':True,'status':'Administración orientada','reason':'Petición administrativa; instrucciones del módulo, sin cambios ejecutados'}
    if result.get('pending_operation'):
        return {'passed':False,'status':'Pendiente de confirmación','reason':'Retiro preparado sin modificar la base; requiere confirmación en la interfaz de EscoIA'}
    path,_,student,offer,teacher=read_target(home,question)
    expected={'action':'remove','student_id':student['id'],'number':student['number'],'offering_id':offer['id'],'teacher_id':teacher['id'],'group':offer['group_code']}
    if result.get('academic_operation')!=expected:raise ValueError('La operación no corresponde al alumno, grupo o docente solicitados')
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        remains=db.execute('SELECT 1 FROM enrollments WHERE student_id=? AND offering_id=?',(student['id'],offer['id'])).fetchone()
    return {'passed':not bool(remains),'status':'Administración comprobada','reason':'Alumno, matrícula, docente y grupo verificados contra la base de datos; baja de la inscripción comprobada' if not remains else 'El alumno aún está inscrito'}
