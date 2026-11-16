import subprocess,tempfile,pathlib,sqlite3,os,json,time,urllib.request,uuid
base=pathlib.Path(__file__).resolve().parents[3];root=base/'outputs/sistema-escolar';native=base/'work/build-v2/sistema_service'
with tempfile.TemporaryDirectory(prefix='escoia-asistencia-') as temp:
 db=pathlib.Path(temp)/'test.db'
 for name in ['schema.sql','002.sql']:subprocess.run([str(native),str(db),'--init',str(root/'db'/name)],check=True,capture_output=True)
 conn=sqlite3.connect(db);conn.execute("insert into users(role,external_id)values('admin','local')");conn.commit();conn.close()
 subprocess.run([str(native),str(db),'--init',str(root/'db/demo.sql')],check=True,capture_output=True)
 env=dict(os.environ,DATABASE=str(db),NATIVE_BIN=str(native),PORT='8789',PUBLIC_ORIGIN='http://127.0.0.1:8789',AI_ENABLED='false',ACADEMIC_RAG_HOME=str(pathlib.Path(temp)/'brain'),UPLOADS_DIR=str(pathlib.Path(temp)/'uploads'))
 with open(pathlib.Path(temp)/'server.log','w') as log:
  p=subprocess.Popen(['/opt/homebrew/bin/node','--import','tsx','main.ts'],cwd=root/'server',env=env,stdout=log,stderr=log)
  try:
   csrf=''
   def req(path,body=None):
    data=json.dumps(body).encode() if body else None
    request=urllib.request.Request('http://127.0.0.1:8789/api/'+path,data=data,headers={'Content-Type':'application/json','X-CSRF-Token':csrf})
    with urllib.request.urlopen(request,timeout=5) as r:return json.load(r)
   for _ in range(40):
    try:csrf=req('me')['csrf'];break
    except Exception:time.sleep(.1)
   if not csrf:raise RuntimeError('Servidor de prueba no responde')
   def record(op,params):return req('records',{'op':op,'params':params,'requestId':str(uuid.uuid4())})
   t=record('teacher_create',['Alejandro Silva','Contaduría',5,None]);record('teacher_update',['Alejandro Silva Actualizado','Contaduría',6,t['id']]);assert any(x['name']=='Alejandro Silva Actualizado' for x in req('records/teachers'));record('teacher_delete',[t['id']])
   start=int(time.time())-60;session=record('schedule_create',[1,1,start,start+3600]);context=req('attendance/context?teacher=1');s=next(s for s in context['sessions'] if s['id']==session['id']);assert s['teacher'] and s['group_code'] and s['subject'] and s['students'][0]['number']
   def upload_csv(text):
    boundary='Escoia'+uuid.uuid4().hex
    payload=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="lista.csv"\r\nContent-Type: text/csv\r\n\r\n'+text+f'\r\n--{boundary}--\r\n').encode()
    request=urllib.request.Request('http://127.0.0.1:8789/api/upload?kind=csv',data=payload,headers={'Content-Type':'multipart/form-data; boundary='+boundary,'X-CSRF-Token':csrf})
    try:
     with urllib.request.urlopen(request,timeout=10) as r:return json.load(r)['uploadId']
    except urllib.error.HTTPError as e:raise RuntimeError(e.read().decode()) from e
   uid=upload_csv('matricula;nombre\n001999;Alumno Importado\n')
   body={'action':'preview','uploadId':uid,'extension':'csv','kind':'lista'}
   preview=req('academic-import',body);assert preview['rows'][0]['matricula']=='001999'
   body.update(action='commit',name='lista.csv',teacherId=1,offeringId=1,rows=preview['rows'])
   result=req('academic-import',body);assert result['registered']==1 and result['rag']['document_id']
   again=req('academic-import',body);assert again['rag']['duplicate']
   conn=sqlite3.connect(db);assert conn.execute("select count(*) from students where number='001999'").fetchone()[0]==1;conn.close()
   uid=upload_csv('materia;grupo;aula;inicio;fin\n')
   subjects=req('records/subjects');offer=req('records/offerings')[0];subject=next(x for x in subjects if x['id']==offer['subject_id']);room=req('records/rooms')[0]
   from datetime import datetime,timedelta,timezone
   dt=datetime.now(timezone.utc)+timedelta(days=3)
   rows=[{'materia':subject['code'],'grupo':offer['group_code'],'aula':room['name'],'inicio':dt.replace(microsecond=0).isoformat(),'fin':(dt+timedelta(hours=1)).replace(microsecond=0).isoformat()}]
   body={'action':'commit','uploadId':uid,'extension':'csv','kind':'horario','name':'horario.csv','teacherId':offer['teacher_id'],'rows':rows}
   result=req('academic-import',body);assert result['rag']['document_id']
   before=len(req('attendance/context?teacher='+str(offer['teacher_id']))['sessions'])
   bad=[dict(rows[0],inicio=(dt+timedelta(days=1)).replace(microsecond=0).isoformat(),fin=(dt+timedelta(days=1,hours=1)).replace(microsecond=0).isoformat()),dict(rows[0],fin=(dt+timedelta(hours=2)).replace(microsecond=0).isoformat())]
   try:req('academic-import',dict(body,rows=bad));raise AssertionError('Se aceptó un choque de horario')
   except urllib.error.HTTPError:pass
   assert len(req('attendance/context?teacher='+str(offer['teacher_id']))['sessions'])==before
   import sys
   sys.path.insert(0,str(base/'outputs/second-brain/src'))
   from second_brain.core import Brain
   from second_brain.academic_import import archive
   b=Brain(pathlib.Path(temp)/'brain');source=pathlib.Path(temp)/'weekly.pdf';source.write_bytes(b'%PDF-1.4')
   doc=archive(b,source,'pdf','horario','weekly.pdf',[{'dia_semana':0,'materia':subject['code'],'grupo':offer['group_code'],'hora_inicio':'14:00','hora_fin':'15:00'}],{'docente_id':offer['teacher_id'],'horario_tipo':'semanal','zona_horaria':'America/Mexico_City','periodo':'AGO-DIC 2026'});b.close()
   generated=req('attendance/generate',{'documentId':doc['document_id'],'teacherId':offer['teacher_id'],'roomId':room['id'],'start':'2026-10-19','end':'2026-10-19','exclude':[]});assert generated['registered']==1
   print('Generación HTTP: horario semanal convertido en sesión fechada con aula.')
   print('Importación HTTP: CSV lista y horario registrados, RAG persistido, reintento sin duplicados.')
   student=s['students'][0]['id']
   def manual():return req('tool',{'tool':'mcp_biometrics_tool','payload':{'action':'manual','sessionId':session['id'],'studentId':student,'status':'present','reason':'Prueba HTTP supervisada'},'requestId':str(uuid.uuid4())})
   manual();r=manual();assert r['result']['alreadyRecorded'];print('HTTP verificado: ABC docente, horario, lista con matrículas y asistencia duplicada sin nueva fila.')
  finally:p.terminate();p.wait(timeout=10)
