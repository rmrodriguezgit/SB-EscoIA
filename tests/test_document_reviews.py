import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain,atomic
from second_brain import request_records as records,request_git as repo,document_reviews as docs
class DocumentReviewsTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.b=Brain(Path(self.tmp.name));self.rid=records.start(self.b,'Explica el muestreo')
  with patch.object(records,'verify',return_value={'passed':True,'status':'reglas'}):records.finish(self.b,self.rid,{'text':'Resultado'})
 def tearDown(self):self.b.close();self.tmp.cleanup()
 def review(self,name='request.md',answer=None):
  with patch('second_brain.remote_ai._review',return_value=answer or {'passed':True,'truncated':False}),patch('second_brain.remote_ai.enabled',return_value=True):
   return docs.review(self.b,self.rid,name,repo.history(self.b,self.rid)['head'])['review']
 def test_pending_then_laya_approval_tracks_current_revision(self):
  self.assertEqual(records.read(self.b,self.rid)['document_review']['state'],'pending')
  approved=self.review();self.assertEqual(approved['state'],'approved');self.assertTrue(approved['current']);self.assertIn('LAYA remoto',approved['engine']);self.assertTrue(approved['at'])
  data=records.read(self.b,self.rid);records.edit(self.b,self.rid,data['markdown']+'\nCambio',data['revision'])
  self.assertEqual(records.read(self.b,self.rid)['document_review']['state'],'outdated')
 def test_file_tampering_invalidates_laya_even_without_revision_change(self):
  self.review();path=self.b.home/'data/requests'/self.rid/'request.md';path.write_text(path.read_text()+'\nModificado externamente')
  self.assertEqual(docs.status(self.b,self.rid,'request.md')['state'],'outdated')
 def test_each_markdown_has_independent_review(self):
  path=self.b.home/'data/exports'/self.rid/'Notas.md';atomic(path,'Tema de muestreo');repo.snapshot(self.b,self.rid,'Añadir Markdown')
  self.review('artifacts/Notas.md')
  self.assertEqual(docs.status(self.b,self.rid,'request.md')['state'],'pending');self.assertEqual(docs.status(self.b,self.rid,'artifacts/Notas.md')['state'],'approved')
  repo.artifact(self.b,self.rid,'artifacts/Notas.md','Otro contenido',repo.history(self.b,self.rid)['head'])
  self.assertEqual(docs.status(self.b,self.rid,'artifacts/Notas.md')['state'],'outdated')
 def test_laya_failure_is_pending_not_approved(self):
  with patch('second_brain.remote_ai._review',side_effect=RuntimeError('Sin conexión')),patch('second_brain.remote_ai.enabled',return_value=True):
   result=docs.review(self.b,self.rid,'request.md',repo.history(self.b,self.rid)['head'])['review']
  self.assertEqual(result['state'],'pending');self.assertIn('Sin conexión',result['reason'])
 def test_laya_rejection_and_path_validation(self):
  self.assertEqual(self.review(answer={'passed':False,'truncated':False})['state'],'rejected')
  with self.assertRaises(ValueError):docs.document(self.b,self.rid,'../secret.md')
