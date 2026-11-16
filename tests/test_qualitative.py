import json,tempfile,unittest
from unittest.mock import patch
from second_brain import research
from second_brain.core import Brain

DOC={'title':'Percepción de la evaluación','design':{'instrument':'entrevista','criteria':['Docente con 5+ años'],'guide':['¿Cómo evalúas?'],'saturation_window':2},
 'codes':[{'id':'cat1','label':'Evaluación formativa','level':'axial'},{'id':'c1','label':'retroalimentación','level':'abierto','parent':'cat1'},
  {'id':'c2','label':'rúbricas','level':'abierto','parent':'cat1'},{'id':'e1','label':'Carga administrativa','level':'emergente'},
  {'id':'bad','label':'padre abierto','level':'abierto','parent':'c1'}],
 'informants':[{'alias':'A','segments':[{'text':'Doy retroalimentación cada semana','codes':['c1']},{'text':'Uso rúbricas','codes':['c2','inexistente']}]},
  {'alias':'B','segments':[{'text':'La carga de papeleo me quita tiempo','codes':['e1']}]},
  {'alias':'C','segments':[{'text':'También retroalimento','codes':['c1']}]},{'alias':'D','segments':[{'text':'Uso rúbricas igual','codes':['c2']}]}]}
RESULT={'status':'calculated','label':'t','statistic':2.1,'p':0.04,'alpha':0.05,'decision':'Se rechaza H0','effect':{'name':'g','value':0.6,'magnitude':'mediano'}}

class Qualitative(unittest.TestCase):
 def setUp(self):
  self.dir=tempfile.TemporaryDirectory();self.b=Brain(self.dir.name)
  self.owner=patch.object(research,'owner',return_value=(5,'teacher'));self.owner.start()
 def tearDown(self):
  self.owner.stop();self.b.close();self.dir.cleanup()
 def test_saturation_matrix_and_hierarchy(self):
  q=research.qual_save(self.b,DOC)
  self.assertTrue(q['saturation']['reached'])
  self.assertEqual([c['new_codes'] for c in q['saturation']['curve']],[2,1,0,0])
  cat={r['label']:r for r in q['matrix']}
  self.assertEqual(cat['Evaluación formativa']['codes'],['retroalimentación','rúbricas'])
  self.assertEqual(cat['Evaluación formativa']['total'],4)
  self.assertIsNone(next(c for c in q['codes'] if c['id']=='bad')['parent'],'un código abierto no puede ser categoría')
  self.assertEqual(q['informants'][0]['segments'][1]['codes'],['c2'],'códigos inexistentes se descartan')
 def test_revision_conflict_and_isolation(self):
  q=research.qual_save(self.b,DOC)
  research.qual_save(self.b,{**DOC,'id':q['id'],'revision':q['revision']})
  with self.assertRaisesRegex(ValueError,'Otra ventana'):research.qual_save(self.b,{**DOC,'id':q['id'],'revision':q['revision']})
  with patch.object(research,'owner',return_value=(6,'teacher')):
   self.assertEqual(research.qual_list(self.b),[])
   with self.assertRaisesRegex(ValueError,'otro docente'):research.qual_get(self.b,q['id'])
 def test_triangulation_keeps_only_literal_quotes(self):
  q=research.qual_save(self.b,DOC)
  fake={'verdict':'convergente','summary':'ok','claims':[{'claim':'La retroalimentación es frecuente','segments':['s1-1'],'quote':'retroalimentación cada semana'},
   {'claim':'inventado','segments':['s1-1'],'quote':'el 90% aprueba'},{'claim':'id falso','segments':['s9-9'],'quote':'Uso rúbricas'}]}
  with patch('second_brain.runtime.ollama',return_value={'message':{'content':json.dumps(fake)}}),patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.local_model',return_value='m'):
   t=research.triangulate(self.b,q['id'],RESULT)
  self.assertEqual(t['verdict'],'convergente');self.assertEqual(len(t['claims']),1);self.assertEqual(t['rejected_claims'],2)
  with patch('second_brain.runtime.ollama',return_value={'message':{'content':json.dumps({**fake,'claims':fake['claims'][1:]})}}),patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.local_model',return_value='m'):
   t=research.triangulate(self.b,q['id'],RESULT)
  self.assertEqual(t['verdict'],'sin evidencia suficiente')
