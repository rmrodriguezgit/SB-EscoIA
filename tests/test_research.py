import unittest,tempfile,json
from pathlib import Path
from second_brain.core import Brain
from second_brain import research as r
class ResearchTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.b=Brain(self.tmp.name);self.s=r.create(self.b,{'title':'Estudio','question':'¿Cómo se relaciona la experiencia con satisfacción?','objective':'Integrar evidencia','specific':'Comparar grupos','target_n':8,'qual_target':8})
 def tearDown(self):self.b.close();self.tmp.cleanup()
 def setup_collection(self):
  r.advance(self.b,self.s['id']);r.question(self.b,self.s['id'],{'title':'Satisfacción','kind':'likert'});r.question(self.b,self.s['id'],{'title':'Experiencia','kind':'text'});r.advance(self.b,self.s['id'])
 def test_limits(self):
  with self.assertRaises(ValueError):r.create(self.b,{'title':'A','question':'B','objective':'C','target_n':51})
  for i in range(20):r.question(self.b,self.s['id'],{'title':str(i),'kind':'likert'})
  with self.assertRaises(ValueError):r.question(self.b,self.s['id'],{'title':'21','kind':'likert'})
 def test_arrival_and_correction(self):
  self.setup_collection()
  for i in range(8):
   s=r.dispatch(self.b,{'action':'respond','study_id':self.s['id'],'response':{'arrival':True,'qualitative':True,'consent':True,'answers':{'q1':4,'q2':'Buen servicio'}}});self.assertEqual(s['last_registered'],f'P{i+1:02d}')
  with self.assertRaises(ValueError):r.respond(self.b,self.s['id'],{'arrival':True,'qualitative':True,'consent':True,'answers':{'q1':4,'q2':'A'}})
  r.respond(self.b,self.s['id'],{'id':'P01','qualitative':True,'consent':True,'answers':{'q1':1,'q2':'Mejorar servicio'}})
  self.assertEqual(len(r.get(self.b,self.s['id'])['responses']),8)
  self.assertEqual(r.advance(self.b,self.s['id'])['phase'],3)
 def test_consent_and_types_and_freeze(self):
  self.setup_collection()
  for d in [{'consent':False,'answers':{}},{'consent':True,'answers':{'q1':True,'q2':'A'}}]:
   with self.assertRaises(ValueError):r.respond(self.b,self.s['id'],dict(d,id='P01',qualitative=True))
  r.respond(self.b,self.s['id'],{'arrival':True,'qualitative':True,'consent':True,'answers':{'q1':5,'q2':'A'}})
  with self.assertRaises(ValueError):r.question(self.b,self.s['id'],{'title':'Nuevo','kind':'text'})
  with self.assertRaises(ValueError):r.advance(self.b,self.s['id'])
 def test_scope_unknown_and_qualitative(self):
  self.setup_collection()
  with self.assertRaises(ValueError):r.respond(self.b,self.s['id'],{'arrival':True,'qualitative':False,'consent':True,'answers':{'q1':4,'q2':'No pertenece'}})
 def test_recover_preserves(self):
  r.init(self.b);self.b.db.execute("INSERT INTO research_jobs VALUES('j',?,'running',NULL,NULL,'hoy')",(self.s['id'],));self.b.db.commit();r.recover(self.b);self.assertEqual(r.get(self.b,self.s['id'])['jobs'][0]['status'],'interrupted')
