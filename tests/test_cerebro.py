import json,tempfile,unittest
from pathlib import Path
from unittest import mock
from second_brain.core import Brain
from second_brain import cerebro

def fake_reply(answer,actions):
 return lambda path,payload=None,timeout=0:{'message':{'content':json.dumps({'answer':answer,'actions':actions})}}

class CerebroTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.b=Brain(Path(self.tmp.name))
  for p in [mock.patch('second_brain.runtime.assert_resources',lambda *a,**k:None),mock.patch('second_brain.runtime.local_model',lambda:'llmlx:qwen3.5:4b')]:p.start();self.addCleanup(p.stop)
 def tearDown(self):self.b.close();self.tmp.cleanup()
 def ask(self,answer,actions,q='¿Qué hago?'):
  with mock.patch('second_brain.runtime.ollama',fake_reply(answer,actions)):return cerebro.ask(self.b,q)
 def test_filters_actions_to_catalog(self):
  plan=self.ask('Hola',[{'type':'shell','title':'x','reason':'','text':'rm -rf /'},{'type':'abrir','title':'','reason':'','text':'horarios'},
   {'type':'abrir','title':'','reason':'','text':'Inexistente'},{'type':'recordar','title':'','reason':'','text':''},
   {'type':'liberar_memoria','title':'','reason':'','text':'algo'},{'type':'tarea','title':'a','reason':'','text':'t1'},{'type':'tarea','title':'b','reason':'','text':'t2'}])
  self.assertEqual([a['type'] for a in plan['actions']],['abrir','liberar_memoria','tarea','tarea'])
  self.assertEqual(plan['actions'][0]['text'],'Horarios');self.assertEqual(plan['actions'][1]['text'],'')
  self.assertTrue(all(a['status']=='propuesta' for a in plan['actions']))
 def test_nothing_runs_until_accepted(self):
  plan=self.ask('Te propongo guardar esto',[{'type':'recordar','title':'Guardar','reason':'','text':'Revisar LAN-201 el lunes'},{'type':'tarea','title':'Investigar','reason':'','text':'Resumir el plan LAN'}])
  self.assertFalse(self.b.rows("SELECT 1 FROM memories WHERE text LIKE 'Revisar LAN-201%'"))
  self.assertFalse(self.b.rows('SELECT 1 FROM tasks'))
  r=cerebro.decide(self.b,plan['id'],0,'accept')
  self.assertEqual(r['status'],'aceptada');self.assertTrue(self.b.rows("SELECT 1 FROM memories WHERE text='Revisar LAN-201 el lunes' AND type='inbox'"))
  self.assertEqual(cerebro.decide(self.b,plan['id'],1,'reject')['status'],'descartada')
  self.assertFalse(self.b.rows('SELECT 1 FROM tasks'))
  with self.assertRaises(ValueError):cerebro.decide(self.b,plan['id'],0,'accept')
  with self.assertRaises(ValueError):cerebro.decide(self.b,plan['id'],5,'accept')
  with self.assertRaises(ValueError):cerebro.decide(self.b,'../x',0,'accept')
 def test_main_window_actions_return_ui(self):
  plan=self.ask('Pídelo en la conversación',[{'type':'consulta','title':'Consultar','reason':'Con fuentes','text':'Materias de LAN primer semestre'},{'type':'tarea','title':'T','reason':'','text':'Objetivo'}])
  self.assertEqual(cerebro.decide(self.b,plan['id'],0,'accept')['ui'],{'type':'consulta','text':'Materias de LAN primer semestre'})
  r=cerebro.decide(self.b,plan['id'],1,'accept');self.assertTrue(self.b.rows('SELECT 1 FROM tasks WHERE id=?',(r['task_id'],)))
  saved=json.loads((Path(self.tmp.name)/'data/cerebro'/(plan['id']+'.json')).read_text())
  self.assertEqual([a['status'] for a in saved['actions']],['aceptada','aceptada'])
 def test_expired_plan_is_not_executed(self):
  plan=self.ask('x',[{'type':'tarea','title':'T','reason':'','text':'Objetivo'}])
  path=Path(self.tmp.name)/'data/cerebro'/(plan['id']+'.json');data=json.loads(path.read_text());data['created']-=cerebro.PLAN_TTL+1;path.write_text(json.dumps(data))
  with self.assertRaises(ValueError):cerebro.decide(self.b,plan['id'],0,'accept')
  self.assertFalse(self.b.rows('SELECT 1 FROM tasks'))
 def test_explicit_section_overrides_model_choice(self):
  plan=self.ask('Consejo',[{'type':'abrir','title':'x','reason':'','text':'Conversación'}],q='Abre el módulo de horarios y dame un consejo')
  self.assertEqual([(a['type'],a['text']) for a in plan['actions']],[('abrir','Horarios')])
  self.assertIsNone(cerebro.requested_section('¿Qué horario conviene para estudiar?'))
 def test_empty_answer_fails(self):
  with self.assertRaises(RuntimeError):self.ask('',[])

if __name__=='__main__':unittest.main()
