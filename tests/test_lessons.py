import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from second_brain.lessons import requested,topic_query,notebook,create,web_sources
from second_brain.core import Brain
class Lessons(unittest.TestCase):
 def test_intent_preserves_catalog_queries(self):
  self.assertTrue(requested('Explica el tema valor presente neto de LAN864'))
  self.assertTrue(requested('Explica la estadística descriptiva'))
  self.assertFalse(requested('Lista los temas de LAN864'))
  self.assertFalse(requested('¿Cuál es el objetivo de LAR105?'))
 def test_topic_only_sent_to_web(self):
  self.assertNotIn('LAN864',topic_query('Desarrolla el tema valor presente neto de LAN864'))
 def test_notebooks_are_reproducible(self):
  for topic in ['valor presente neto','punto de equilibrio','estadística descriptiva']:
   nb,result,_=notebook(topic,[])
   self.assertEqual(nb['nbformat'],4);self.assertTrue(result)
   self.assertIn('$$', ''.join(''.join(c['source']) for c in nb['cells']))
   for c in nb['cells']:
    if c['cell_type']=='code':
     import io,contextlib
     out=io.StringIO()
     with contextlib.redirect_stdout(out):exec(''.join(c['source']),{})
     self.assertEqual(out.getvalue(),result)
 def test_no_irrelevant_notebook(self):self.assertIsNone(notebook('ética empresarial',[]))
 def test_web_failure_does_not_invent_theory(self):
  with tempfile.TemporaryDirectory() as t:
   b=Brain(Path(t))
   with patch('second_brain.knowledge.curriculum_evidence',return_value={'sources':[]}),patch('second_brain.lessons.web_sources',side_effect=RuntimeError('sin conexión')):
    result=create(b,'Explica el tema punto de equilibrio','LAN','run')
   self.assertFalse(result['validation']['passed']);self.assertIn('sin conexión',result['text']);self.assertEqual(result['artifacts'][0]['format'],'ipynb')
   manifest=list((b.home/'data/exports').glob('*/plan.json'))[0];d=json.loads(manifest.read_text());self.assertTrue((manifest.parent/d['files']['ipynb']).is_file());b.close()
 def test_doi_without_abstract_not_used_as_evidence(self):
  import io
  data={'message':{'items':[{'title':['Punto de equilibrio'],'DOI':'10.1000/test'}]}}
  with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(data).encode())):self.assertEqual(web_sources('punto de equilibrio'),[])
 def test_irrelevant_shared_word_rejected(self):
  import io
  data={'message':{'items':[{'title':['Presente de subjuntivo'],'DOI':'10.1000/test','abstract':'Estudio del valor del presente de subjuntivo en español.'}]}}
  with patch('urllib.request.urlopen',return_value=io.BytesIO(json.dumps(data).encode())):self.assertEqual(web_sources('valor presente neto'),[])
 def test_clean_topic_keeps_conceptual_prepositions(self):
  self.assertEqual(topic_query('Desarrolla el tema punto de equilibrio de LAN864 con caso práctico ipynb'),'punto de equilibrio')
 def test_known_financial_results(self):
  self.assertIn('VPN a tasa 10%: -131.48',notebook('valor presente neto',[])[1])
  self.assertIn('Punto de equilibrio: 200.00 unidades',notebook('punto de equilibrio',[])[1])
 def test_numbered_topic_resolves_from_curriculum(self):
  with tempfile.TemporaryDirectory() as t:
   b=Brain(Path(t));record={'programa_asignatura':{'unidades':[{'titulo':'Costos','temas_y_subtemas':[{'numero':'1.1','texto':'Punto de equilibrio'}]}]}}
   with patch('second_brain.knowledge.curriculum_evidence',return_value={'sources':[],'records':[record]}),patch('second_brain.lessons.web_sources',return_value=[]) as web:
    r=create(b,'Desarrolla el tema 1.1 de LAN864','LAN','run')
   web.assert_called_once_with('Punto de equilibrio');self.assertEqual(r['text'].split(':')[0],'Punto de equilibrio');self.assertEqual(len(r['artifacts']),1);b.close()

 def test_exact_user_request_extracts_clean_topic(self):
  q='Desarrolla el tema de EL ANÁLISIS DE DATOS haz el marco teórico, ejemplos y entrega un archivo ipynb con el tema y las prácticas.'
  self.assertEqual(topic_query(q),'ANÁLISIS DE DATOS')
 def test_analysis_notebook_runs_all_cells_and_known_results(self):
  nb,results,_=notebook('Análisis de datos',[])
  self.assertGreaterEqual(sum(c['cell_type']=='code' for c in nb['cells']),5)
  self.assertIn('Registros válidos: 9',results)
  self.assertIn('pendiente=5.0000; intercepto=50.0000',results)
  namespace={}
  import io,contextlib
  with contextlib.redirect_stdout(io.StringIO()):
   for c in nb['cells']:
    if c['cell_type']=='code':exec(''.join(c['source']),namespace)
  self.assertEqual(len(namespace['limpios']),9)
 def test_summary_download_and_no_memory_as_reference(self):
  with tempfile.TemporaryDirectory() as t:
   b=Brain(Path(t))
   with patch('second_brain.knowledge.curriculum_evidence',return_value={'sources':[{'kind':'memory','citation':'memoria privada','text':'nota personal'}]}),patch('second_brain.lessons.web_sources',return_value=[]):
    r=create(b,'Desarrolla el tema de EL ANÁLISIS DE DATOS haz el marco teórico, ejemplos y entrega un archivo ipynb con el tema y las prácticas.','','run')
   self.assertTrue(r['artifacts']);self.assertLess(len(r['text']),650);self.assertEqual(r['sources'],[])
   self.assertNotIn('memoria privada',json.dumps(r))
   manifest=list((b.home/'data/exports').glob('*/plan.json'))[0];nb=json.loads((manifest.parent/json.loads(manifest.read_text())['files']['ipynb']).read_text())
   self.assertIn('Actividad de cierre',''.join(''.join(c['source']) for c in nb['cells']));b.close()
