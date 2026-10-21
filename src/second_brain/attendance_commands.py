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

def execute(brain,question,run):
    if not re.search(r'\b(quita|quitar|retira|retirar|elimina|eliminar|borra|borrar)\b',normal(question)) or not any(word in normal(question) for word in ('lista','grupo')):
        return {'text':'Esta petición corresponde a la administración de listas. Abre Asistencia → Administrar listas por grupo para altas, edición o cambio de grupo; no se ha modificado ningún registro.','sources':[],'mode':'Administración de listas','administrative_guidance':True,'run_id':run}
    path,binary,student,offer,teacher=read_target(brain.home,question)
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        member=db.execute('SELECT 1 FROM enrollments WHERE student_id=? AND offering_id=?',(student['id'],offer['id'])).fetchone()
        actor=db.execute("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").fetchone()
    if not actor:raise ValueError('No se encontró administración local autorizada')
    if member:
        steps=[{'op':'unenroll','params':[student['id'],offer['id']]},{'op':'audit_create','params':[actor[0],'lista-remove-chat',str(offer['id']),int(time.time()),json.dumps({'request_id':run,'student_id':student['id'],'number':student['number'],'teacher_id':teacher['id'],'group':offer['group_code']},ensure_ascii=False)]}]
        result=subprocess.run([str(binary),str(path)],input=json.dumps({'id':1,'op':'batch','steps':steps})+'\n',capture_output=True,text=True,timeout=15,check=True)
        response=json.loads(result.stdout.strip())
        if not response.get('ok'):raise ValueError(response.get('error','No se modificó la lista'))
    operation={'action':'remove','student_id':student['id'],'number':student['number'],'offering_id':offer['id'],'teacher_id':teacher['id'],'group':offer['group_code']}
    brain.event(run,'Administración','Lista actualizada; historial conservado')
    return {'text':f"{student['name']} · matrícula {student['number']} {'fue retirado de' if member else 'ya no pertenece a'} la lista {offer['group_code']} — {offer['subject']} del docente {teacher['name']}. Se conservan su biometría y las asistencias anteriores; no se modificaron otras listas.",'sources':[],'mode':'Administración de listas · operación comprobada','academic_operation':operation,'run_id':run}

def verify(home,question,result):
    if result.get('administrative_guidance'):
        return {'passed':True,'status':'Administración orientada','reason':'Petición administrativa; instrucciones del módulo, sin cambios ejecutados'}
    path,_,student,offer,teacher=read_target(home,question)
    expected={'action':'remove','student_id':student['id'],'number':student['number'],'offering_id':offer['id'],'teacher_id':teacher['id'],'group':offer['group_code']}
    if result.get('academic_operation')!=expected:raise ValueError('La operación no corresponde al alumno, grupo o docente solicitados')
    with sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True) as db:
        remains=db.execute('SELECT 1 FROM enrollments WHERE student_id=? AND offering_id=?',(student['id'],offer['id'])).fetchone()
    return {'passed':not bool(remains),'status':'Administración comprobada','reason':'Alumno, matrícula, docente y grupo verificados contra la base de datos; baja de la inscripción comprobada' if not remains else 'El alumno aún está inscrito'}
