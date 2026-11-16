import json,tempfile,unittest
from unittest.mock import patch
from second_brain import copilot
from second_brain.core import Brain

REC={'programa_asignatura':{'objetivo':'Comprender la sociedad.','actividades_academico':'• Debate\n • Mapa mental','actividades_independientes':'• Reseña crítica','evaluacion':'• Examen 50%\n • Portafolio 50%',
 'unidades':[{'numero':'I','titulo':'UNIDAD UNO','temas_y_subtemas':[{'numero':'1.1','texto':'Marco conceptual'},{'numero':'1.1.1','texto':'Individuo'},{'numero':'1.2','texto':'Conceptos'}]},
  {'numero':'II','titulo':'UNIDAD DOS','temas_y_subtemas':[{'numero':'2.1','texto':'Identidad'},{'numero':'2.2','texto':'Desigualdad'},{'numero':'2.3','texto':'Democracia'},{'numero':'2.4','texto':'Religión'}]}]},
 'fuente_pdf':{'archivo':'Anexo.pdf','pagina_inicio':1,'pagina_fin':2},'hc':32,'hi':16,'creditos':3}

class Copilot(unittest.TestCase):
 def setUp(self):
  self.dir=tempfile.TemporaryDirectory();self.b=Brain(self.dir.name)
  with self.b.db:self.b.db.execute('INSERT INTO academic_records(id,career,code,name,semester,record_json) VALUES(?,?,?,?,?,?)',('r1','LAR','LARX','RADIOGRAFÍA SOCIAL',1,json.dumps(REC)))
 def tearDown(self):self.b.close();self.dir.cleanup()
 def test_plan_covers_16_weeks_in_official_order(self):
  p=copilot.plan16(self.b,'larx','2026-08-12')
  self.assertEqual(p['start'],'2026-08-10','alinea al lunes');self.assertEqual(len(p['weeks']),16)
  w={x['week']:x for x in p['weeks']}
  self.assertEqual((w[1]['unit'],w[8]['unit'],w[16]['unit']),('Encuadre','Evaluación parcial','Evaluación final'))
  content=[t for x in p['weeks'] if x['week'] not in (1,8,16) for t in x['topics']]
  official=['1.1','1.2','2.1','2.2','2.3','2.4']
  firsts=[t.split(' ')[0] for t in content]
  self.assertEqual([c for i,c in enumerate(firsts) if c not in firsts[:i]],official,'todos los subtemas oficiales, en orden')
  self.assertIn('Individuo',content[0],'sub-subtemas agregados a su subtema')
  self.assertEqual(w[16]['to'],'2026-11-27')
  with self.assertRaisesRegex(ValueError,'Fecha'):copilot.plan16(self.b,'LARX','agosto')
  with self.assertRaisesRegex(ValueError,'programa oficial'):copilot.plan16(self.b,'NOPE','2026-08-10')
 def test_resource_only_for_official_topics(self):
  with self.assertRaisesRegex(ValueError,'no aparece'):copilot.resource(self.b,'LARX','Física cuántica','ejemplo')
  with self.assertRaisesRegex(ValueError,'no permitido'):copilot.resource(self.b,'LARX','1.1 Marco conceptual','poema')
  with patch('second_brain.runtime.ollama',return_value={'message':{'content':'<think>…</think>## Ejemplo\nTexto'}}) as o,patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.local_model',return_value='m'):
   r=copilot.resource(self.b,'LARX','1.1 Marco conceptual · Individuo','codigo')
  self.assertEqual(r['markdown'],'## Ejemplo\nTexto');self.assertIn('no se ha ejecutado',r['note'])
  self.assertIn('código ejecutable',o.call_args[0][1]['messages'][1]['content'])
