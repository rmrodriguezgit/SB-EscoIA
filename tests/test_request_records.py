import unittest,tempfile,json
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain
from second_brain import request_records as records
class RequestRecords(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.brain=Brain(Path(self.tmp.name))
 def tearDown(self):self.brain.close();self.tmp.cleanup()
 def test_subject_mismatch_is_rejected_before_model(self):
  rid=records.start(self.brain,'LAN105 muéstrame temas y subtemas')
  with patch('second_brain.remote_ai._review') as review:
   result=records.finish(self.brain,rid,{'text':'LAR105 — 1.1 Tema y 1.1.1 Subtema','run_id':rid})
   self.assertFalse(result['passed']);self.assertEqual(result['status'],'rechazada por reglas');review.assert_not_called();self.assertIn('LAN105',result['reason'])
  self.assertTrue(records.read(self.brain,rid)['integrity'])
 def test_edit_invalidates_review_preserves_original_and_checks_revision(self):
  rid=records.start(self.brain,'LAR105 temas y subtemas')
  with patch('second_brain.remote_ai.enabled',return_value=True),patch('second_brain.remote_ai._review',return_value={'passed':True,'truncated':False,'support_probability':.99}):records.finish(self.brain,rid,{'text':'LAR105: 1.1 Tema','run_id':rid})
  original=records.read(self.brain,rid);updated=records.edit(self.brain,rid,original['markdown']+'\nIncluye objetivos.',1)
  self.assertEqual(updated['status'],'pendiente de revisión');self.assertIsNone(updated['verification'])
  with self.assertRaises(ValueError):records.edit(self.brain,rid,'otro cambio',1)
  contract=json.loads((self.brain.home/'data/requests'/rid/'contract.json').read_text());self.assertEqual(contract['original_request'],'LAR105 temas y subtemas')
 def test_external_edit_is_detected_and_path_traversal_rejected(self):
  rid=records.start(self.brain,'LAR105 temas');(self.brain.home/'data/requests'/rid/'request.md').write_text('Cambio externo')
  self.assertFalse(records.read(self.brain,rid)['integrity']);self.assertFalse(records.verify(self.brain,rid,{'text':'LAR105'})['passed'])
  with self.assertRaises(ValueError):records.read(self.brain,'../../secret')
 def test_laya_receives_original_request_and_actual_delivery(self):
  rid=records.start(self.brain,'LAR105 temas y subtemas')
  with patch('second_brain.remote_ai.enabled',return_value=True),patch('second_brain.remote_ai._review',return_value={'passed':True}) as review:
   self.assertTrue(records.finish(self.brain,rid,{'text':'LAR105: 1.1 Simulación','run_id':rid})['passed'])
   context=review.call_args.args[0];self.assertIn('LAR105 temas y subtemas',context);self.assertIn('1.1 Simulación',context)

 def test_missing_requested_notebook_is_rejected(self):
  rid=records.start(self.brain,'Desarrolla LAR105 y entrega ipynb')
  review=records.verify(self.brain,rid,{'text':'LAR105 — explicación'})
  self.assertFalse(review['passed']);self.assertIn('ipynb',review['reason'])

 def test_wrong_subject_inside_word_is_rejected(self):
  import zipfile
  rid=records.start(self.brain,'LAR105 entrega docx')
  folder=self.brain.home/'data/exports'/rid;folder.mkdir(parents=True)
  (folder/'plan.json').write_text(json.dumps({'code':'LAR105'}))
  with zipfile.ZipFile(folder/'Programa-LAR105.docx','w') as z:z.writestr('word/document.xml','<w:document xmlns:w="urn:word"><w:t>Programa LAN105</w:t></w:document>')
  result=records.verify(self.brain,rid,{'text':'LAR105','run_id':rid,'artifacts':[{'format':'docx','url':'/api/export?id='+rid+'&format=docx'}]})
  self.assertFalse(result['passed'])

 def test_input_pdf_does_not_imply_pdf_delivery(self):
  rid=records.start(self.brain,'Consulta el PDF de LAR105: temas y subtemas')
  contract=json.loads((self.brain.home/'data/requests'/rid/'contract.json').read_text())
  self.assertEqual(contract['requested_formats'],[])
 def test_restart_closes_orphaned_request(self):
  rid=records.start(self.brain,'LAN105 temas y subtemas')
  records.recover(self.brain)
  record=records.read(self.brain,rid)
  self.assertNotEqual(record['status'],'ejecutándose')
  self.assertTrue(record['integrity'])
  self.assertFalse(record['verification']['passed'])
  self.assertEqual(self.brain.rows('SELECT state FROM events ORDER BY id DESC LIMIT 1')[0]['state'],'fallida')

 def test_extra_subject_topics_are_rejected(self):
  rid=records.start(self.brain,'LAN105 Temas y Subtemas')
  verdict=records.verify(self.brain,rid,{'text':'LAN105 no consta. LAN106 contenido temático: 1.1 Simulación'})
  self.assertFalse(verdict['passed'])
  self.assertIn('LAN106',verdict['reason'])

 def test_truncated_review_retries_smaller_blocks(self):
  rid=records.start(self.brain,'LAR105 temas y subtemas')
  replies=[{'passed':False,'truncated':True,'support_probability':.8},{'passed':True,'truncated':False,'support_probability':.99},{'passed':True,'truncated':False,'support_probability':.99}]
  with patch('second_brain.remote_ai.enabled',return_value=True),patch('second_brain.remote_ai._review',side_effect=replies) as review:
   result=records.verify(self.brain,rid,{'text':'LAR105 contenido temático: 1.1 '+ 'tema '*90})
  self.assertTrue(result['passed']);self.assertEqual(review.call_count,3)
  self.assertFalse(any(c['truncated'] for c in result['checks']))
 def test_unavoidable_truncation_is_pending_not_rejected(self):
  rid=records.start(self.brain,'LAR105 temas y subtemas')
  with patch('second_brain.remote_ai.enabled',return_value=True),patch('second_brain.remote_ai._review',return_value={'passed':False,'truncated':True,'support_probability':.9}):
   result=records.verify(self.brain,rid,{'text':'LAR105 contenido temático: 1.1 tema'})
  self.assertEqual(result['status'],'LAYA pendiente')
  self.assertFalse(result['passed'])
