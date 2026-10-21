import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain
from second_brain.academic_json import install_json,academic_evidence,factual_response,sections
from second_brain.runtime import answer,infer
class AcademicJSON(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.home=Path(self.tmp.name);self.b=Brain(self.home);self.path=self.home/'input.json'
  self.data={'programas':{'actuaria':{'semestres':[{'semestre':1,'totales':{'hc':64,'hi':0,'creditos':4},'materias':[{'clave':'LAR105','nombre':'Prácticas Preliminares de la Profesión','tipo':'Obligatoria','area':'Administración','hc':32,'hi':0,'creditos':2,'instalacion':'Aula'},{'clave':'LAR101','nombre':'Optativa de Lengua Extranjera I','tipo':'Optativa','area':'Lenguas','hc':80,'hi':48,'creditos':8,'instalacion':'Aula'}]}]}}};self.path.write_text(json.dumps(self.data));install_json(self.b,self.path)
 def tearDown(self):self.b.close();self.tmp.cleanup()
 def test_reimport_no_duplicates(self):
  install_json(self.b,self.path);self.assertEqual(len(self.b.rows('SELECT * FROM academic_records')),2);self.assertEqual(len(self.b.rows('SELECT * FROM search')),2)
 def test_complete_semester_and_hours(self):
  r=academic_evidence(self.b,'materias primer semestre','LAR');self.assertEqual(len(r['records']),2);t=factual_response(r,'horas por semana');self.assertIn('LAR101',t);self.assertIn('2 h/semana',t);self.assertIn('No es un horario confirmado',t)
 def test_totals_discrepancy(self):
  d=json.loads((self.home/'data/academic/bd_planes_escoia_completa.json').read_text());self.assertEqual(len(d['_auditoria']['por_carrera']['LAR']['totales_semestre_discrepantes']),1)
 def test_resource_failure_returns_grounded_data(self):
  with patch('second_brain.runtime.model_status',return_value={'available':True}),patch('second_brain.runtime.assert_resources',side_effect=RuntimeError('sin memoria')):r=answer(self.b,'materias primer semestre de Actuaría')
  self.assertIn('LAR101',r['text']);self.assertTrue(r['mode'].startswith('RAG estructurado'));self.assertFalse(r['validation'].get('passed',False))
 def test_laya_rejection_never_shows_draft(self):
  with patch('second_brain.runtime.model_status',return_value={'available':True}),patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.infer',return_value='Borrador LAR105 [1]'),patch('second_brain.runtime.ollama',return_value={'models':[]}),patch('second_brain.adapters.validate_answer',return_value={'passed':False,'status':'reviewed'}):r=answer(self.b,'LAR105')
  self.assertNotIn('Borrador',r['text']);self.assertIn('Prácticas Preliminares',r['text']);self.assertFalse(r['validation'].get('passed',False))
 def test_model_reference_schema(self):
  with patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.ollama',return_value={'message':{'content':'{"answer":"Nombre","source_ids":[1]}'}}) as request:t=infer('nombre',[{'citation':'JSON','text':'Nombre'}])
  self.assertEqual(t,'Nombre [1]');self.assertIn('format',request.call_args.args[1])
 def test_invalid_reference_never_autofilled(self):
  with patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.ollama',return_value={'message':{'content':'{"answer":"Inventado","source_ids":[99]}'}}):
   with self.assertRaises(RuntimeError):infer('nombre',[{'citation':'JSON','text':'Nombre'}])
 def test_sections_keep_topics_no_invented_bibliography(self):
  s=sections('FINES DE APRENDIZAJE O FORMACIÓN\nAprender\nCONTENIDO TEMÁTICO\nI UNIDAD\n1.1 Tema\n1.1.1 Subtema\nCRITERIOS DE EVALUACIÓN\nExamen 100%');self.assertEqual(s['unidades'][0]['temas_y_subtemas'][1]['numero'],'1.1.1');self.assertIsNone(s['bibliografia'])

class NumericGrounding(unittest.TestCase):
 def test_false_number_rejected_before_mlx(self):
  from second_brain.adapters import validate_answer
  result=validate_answer(Path('/not-installed'),'LAR105 tiene 900 horas por semestre. [1]',[{'text':'LAR105 tiene 32 horas por semestre.'}])
  self.assertFalse(result['passed']);self.assertEqual(result['status'],'rejected_by_rules')

 def test_present_number_with_wrong_field_rejected(self):
  from second_brain.knowledge import numeric_checks
  sources=[{'text':'LAR105 — Prácticas. Horas con académico por semestre: 32. Horas independientes por semestre: 0. Créditos: 2.'}]
  self.assertFalse(numeric_checks('LAR105 tiene 2 horas con académico. [1]',sources)['passed'])
  self.assertTrue(numeric_checks('LAR105 tiene 32 horas con académico. [1]',sources)['passed'])
