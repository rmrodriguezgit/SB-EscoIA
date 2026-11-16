import tempfile,unittest
from unittest.mock import patch
from second_brain import memory_layers as ml
from second_brain.core import Brain

class MemoryLayers(unittest.TestCase):
 def setUp(self):
  self.dir=tempfile.TemporaryDirectory();self.b=Brain(self.dir.name)
  self.prof=patch.object(ml,'profile_key',return_value=('7','Docente A'));self.prof.start()
 def tearDown(self):
  self.prof.stop();self.b.close();self.dir.cleanup()
 def test_pin_status_and_forget(self):
  a=self.b.remember('Hecho A');b=self.b.remember('Hecho B')
  ml.pin(self.b,b['id'],True)
  facts=ml.facts(self.b);self.assertEqual(facts[0]['id'],b['id']);self.assertTrue(facts[0]['pinned'])
  self.assertEqual(ml.pinned_texts(self.b),['Hecho B'])
  ml.set_status(self.b,b['id'],'obsoleto')
  self.assertEqual(ml.pinned_texts(self.b),[],'un hecho obsoleto no entra al contexto aunque esté fijado')
  ml.forget(self.b,b['id'])
  self.assertEqual([f['id'] for f in ml.facts(self.b)],[a['id']])
  with self.assertRaisesRegex(ValueError,'inexistente'):ml.pin(self.b,'nope',True)
 def test_pedagogy_is_per_profile_and_mirrored(self):
  d=ml.pedagogy_save(self.b,{'style':'ABP','rigor':'avanzado','languages':['Python',' ','R'],'rules':['Incluir ejercicio guiado'],'evil':1})
  self.assertEqual(d['languages'],['Python','R']);self.assertEqual(d['rigor'],'avanzado');self.assertNotIn('evil',d)
  ml.pedagogy_save(self.b,{**d,'rigor':'nada'})
  mems=self.b.rows("SELECT * FROM memories WHERE reference='pedagogia'")
  self.assertEqual(len(mems),1,'se actualiza el mismo recuerdo espejo');self.assertIn('intermedio',mems[0]['text'])
  with patch.object(ml,'profile_key',return_value=('8','Docente B')):
   self.assertIsNone(ml.pedagogy_get(self.b)['updated'])
 def test_session_estimate_and_compact(self):
  msgs=[{'role':'user','text':'a'*360},{'role':'assistant','text':'b'*360}]
  self.assertEqual(ml.session_info(msgs,4096)['tokens'],200)
  with patch('second_brain.runtime.ollama',return_value={'message':{'content':'<think>x</think>- Decisión: usar rúbricas'}}),patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.local_model',return_value='m'):
   r=ml.compact(self.b,msgs)
  self.assertEqual(r['summary'],'- Decisión: usar rúbricas')
  self.assertEqual(self.b.rows('SELECT type,status FROM memories WHERE id=?',(r['memory_id'],))[0],{'type':'sessions','status':'inferido'})
  with self.assertRaisesRegex(ValueError,'suficiente'):ml.compact(self.b,msgs[:1])
