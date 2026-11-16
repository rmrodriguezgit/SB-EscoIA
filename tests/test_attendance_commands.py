import unittest
from second_brain.attendance_commands import requested,resolve_target
class AttendanceCommandsTest(unittest.TestCase):
 def setUp(self):
  self.students=[{'id':358,'number':'90001','name':'Pérez Gómez Ana Lucía'}]
  self.teachers=[{'id':2,'name':'José Martín López Ruiz'}]
  self.offers=[{'id':11,'group_code':'LAN-201','teacher_id':2}]
  self.q='Quita de la lista LAN201 del docente José Martín López Ruiz al alumno 16 90001 Pérez Gómez Ana Lucía'
 def test_administrative_not_curricular(self):
  self.assertTrue(requested(self.q));self.assertFalse(requested('Dame temas y subtemas de LAN201'))
 def test_exact_target(self):
  s,o,t=resolve_target(self.q,self.students,self.offers,self.teachers)
  self.assertEqual((s['id'],o['id'],t['id']),(358,11,2))
 def test_missing_teacher_and_number_rejected(self):
  for q in [self.q.replace('José Martín López Ruiz','otro docente'),self.q.replace('90001','99999')]:
   with self.assertRaises(ValueError):resolve_target(q,self.students,self.offers,self.teachers)
 def test_ambiguous_lists_not_executed(self):
  with self.assertRaises(ValueError):resolve_target(self.q,self.students,self.offers+self.offers,self.teachers)

import json,sqlite3,subprocess,tempfile,time
from pathlib import Path
from unittest.mock import patch
from second_brain import attendance_commands as ac

class FakeBrain:
 def __init__(self,home):self.home=home;self.events=[]
 def event(self,run,state,message):self.events.append((run,state,message))

class ProposalTests(unittest.TestCase):
 """Una orden escrita nunca modifica la lista: deja una propuesta que se confirma en la interfaz."""
 Q='Quita de la lista LAN201 del docente José Martín López Ruiz al alumno 90001'
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.home=Path(self.tmp.name)
  self.db=self.home/'sistema.db'
  with sqlite3.connect(self.db) as db:
   db.execute('CREATE TABLE enrollments(student_id,offering_id)');db.execute('INSERT INTO enrollments VALUES(358,11)')
   db.execute('CREATE TABLE users(id,role)');db.execute("INSERT INTO users VALUES(1,'admin')")
  target=(self.db,self.home/'sistema_service',{'id':358,'number':'90001','name':'Ana'},{'id':11,'group_code':'LAN-201','subject':'Contabilidad'},{'id':2,'name':'José'})
  self.patch=patch.object(ac,'read_target',return_value=target);self.patch.start()
  self.brain=FakeBrain(self.home)
 def tearDown(self):self.patch.stop();self.tmp.cleanup()
 def propose(self):
  with patch.object(ac.subprocess,'run') as run:
   out=ac.execute(self.brain,self.Q,'r1')
  run.assert_not_called()
  return out
 def test_execute_only_proposes(self):
  out=self.propose()
  self.assertIn('pending_operation',out);self.assertNotIn('academic_operation',out)
  self.assertIn('no se ha modificado',out['text'])
  self.assertEqual(ac.verify(self.home,self.Q,out)['status'],'Pendiente de confirmación')
  data=json.loads((self.home/'data/proposals'/(out['pending_operation']['id']+'.json')).read_text())
  self.assertEqual(data['status'],'pendiente')
 def test_confirm_runs_batch_once(self):
  pid=self.propose()['pending_operation']['id']
  def native(*a,**k):
   with sqlite3.connect(self.db) as db:db.execute('DELETE FROM enrollments')
   return subprocess.CompletedProcess([],0,'{"ok":true}','')
  with patch.object(ac.subprocess,'run',side_effect=native) as run:
   out=ac.decide(self.brain,pid,'confirm')
  self.assertEqual(out['status'],'confirmada');self.assertTrue(out['verification']['passed'])
  steps=json.loads(run.call_args.kwargs['input'])['steps'];self.assertEqual(steps[0]['op'],'unenroll')
  with self.assertRaisesRegex(ValueError,'ya fue confirmada'):ac.decide(self.brain,pid,'confirm')
 def test_reject_and_expiry_do_not_modify(self):
  pid=self.propose()['pending_operation']['id']
  with patch.object(ac.subprocess,'run') as run:
   self.assertEqual(ac.decide(self.brain,pid,'reject')['status'],'cancelada')
   pid2=self.propose()['pending_operation']['id']
   with patch.object(ac.time,'time',return_value=time.time()+ac.PROPOSAL_TTL+1):
    with self.assertRaisesRegex(ValueError,'caducó'):ac.decide(self.brain,pid2,'confirm')
  run.assert_not_called()
 def test_invalid_id_rejected(self):
  for bad in ['../../etc/passwd','abc',None]:
   with self.assertRaises(ValueError):ac.decide(self.brain,bad,'confirm')
