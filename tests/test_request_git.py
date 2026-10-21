import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from second_brain.core import Brain,atomic
from second_brain import request_records as records,request_git as repo
class RequestGitTest(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.b=Brain(Path(self.tmp.name))
 def tearDown(self):self.b.close();self.tmp.cleanup()
 def complete(self):
  rid=records.start(self.b,'Explica el muestreo')
  with patch.object(records,'verify',return_value={'passed':True,'status':'prueba'}):records.finish(self.b,rid,{'text':'Resultado','run_id':rid})
  return rid
 def test_git_commits_rollback_is_new_version_not_execution(self):
  rid=self.complete();h=repo.history(self.b,rid);original=records.read(self.b,rid)
  records.edit(self.b,rid,original['markdown']+'\nCriterio adicional',original['revision'])
  edited=repo.history(self.b,rid);self.assertGreater(len(edited['commits']),len(h['commits']))
  self.assertIn('Criterio adicional',repo.diff(self.b,rid,h['head']))
  restored=repo.rollback(self.b,rid,h['head'],edited['head'])
  self.assertNotIn('Criterio adicional',restored['markdown']);self.assertIsNone(restored['verification'])
  self.assertEqual(restored['status'],'pendiente de revisión');self.assertGreater(len(repo.history(self.b,rid)['commits']),len(edited['commits']))
 def test_stale_head_and_foreign_revision_rejected(self):
  rid=self.complete();head=repo.history(self.b,rid)['head'];current=records.read(self.b,rid)
  records.edit(self.b,rid,current['markdown']+'\nCambio',current['revision'])
  with self.assertRaises(ValueError):repo.rollback(self.b,rid,head,head)
  with self.assertRaises(ValueError):repo.revision(self.b,rid,'0'*40)
 def test_artifact_edit_restore_and_validation(self):
  rid=self.complete();folder=self.b.home/'data/exports'/rid;atomic(folder/'plan.json',json.dumps({'code':'X'}));atomic(folder/'Practica.ipynb',json.dumps({'nbformat':4,'cells':[]}))
  before=repo.snapshot(self.b,rid,'Artefactos');text=json.dumps({'nbformat':4,'cells':[{'cell_type':'markdown','metadata':{},'source':['Caso']} ]})
  repo.artifact(self.b,rid,'artifacts/Practica.ipynb',text,before)
  self.assertIn('Caso',(folder/'Practica.ipynb').read_text())
  repo.rollback(self.b,rid,before,repo.history(self.b,rid)['head']);self.assertNotIn('Caso',(folder/'Practica.ipynb').read_text())
  with self.assertRaises(ValueError):repo.artifact(self.b,rid,'../secret')
 def test_forget_removes_git_artifacts_events_memory_indexes_and_clone(self):
  rid=self.complete();head=repo.history(self.b,rid)['head'];child=repo.reuse(self.b,rid,head)['id']
  memory=self.b.remember('Un derivado',reference='request:'+rid)
  atomic(self.b.home/'data/exports'/rid/'file.md','privado')
  repo.remove(self.b,rid,head,rid)
  for target in [repo.repo(self.b,rid),self.b.home/'data/requests'/rid,self.b.home/'data/exports'/rid,self.b.home/'data/requests'/child]:self.assertFalse(target.exists())
  self.assertFalse(self.b.rows('SELECT * FROM events WHERE task_id=?',(rid,)));self.assertFalse(self.b.rows('SELECT * FROM memories WHERE id=?',(memory['id'],)));self.assertFalse(self.b.rows('SELECT * FROM search WHERE id=?',(memory['id'],)))
 def test_forget_cannot_delete_running_request(self):
  rid=records.start(self.b,'Activa')
  with self.assertRaises(ValueError):repo.remove(self.b,rid,repo.history(self.b,rid)['head'],rid)
 def test_archive_is_recoverable_and_preserves_versions(self):
  rid=self.complete();head=repo.history(self.b,rid)['head']
  repo.archive(self.b,rid,head)
  self.assertTrue(next(i for i in records.recent(self.b) if i['id']==rid)['archived'])
  repo.archive(self.b,rid,repo.history(self.b,rid)['head'],False)
  self.assertFalse(next(i for i in records.recent(self.b) if i['id']==rid)['archived'])
  self.assertGreater(len(repo.history(self.b,rid)['commits']),2)
 def test_forget_scrubs_managed_backup_and_does_not_resurrect_repo(self):
  rid=self.complete();self.b.remember('Un recuerdo derivado',reference='request:'+rid)
  root=self.b.home/'data/backups';root.mkdir()
  self.b.backup(root/'copia')
  result=repo.remove(self.b,rid,repo.history(self.b,rid)['head'],rid)
  self.assertIn('brain.sqlite',result['backups_cleaned'])
  import sqlite3
  with sqlite3.connect(root/'copia/brain.sqlite') as db:self.assertEqual(db.execute('SELECT count(*) FROM memories WHERE reference=?',('request:'+rid,)).fetchone()[0],0)
  self.assertFalse(list((root/'copia/memory').glob('*/*.json')))
  records._snapshot(self.b,rid,'No debe recrearse')
  self.assertFalse(repo.repo(self.b,rid).exists())
  self.assertFalse(self.b.rows('SELECT * FROM events WHERE task_id=?',(rid,)))
 def test_known_tokens_are_redacted_without_breaking_json(self):
  text=json.dumps({'api_key':'private-value','text':'Bearer '+'x'*30,'safe':42}).encode()
  value=json.loads(repo.safe_bytes(text))
  self.assertNotIn('private-value',json.dumps(value));self.assertNotIn('x'*30,value['text']);self.assertEqual(value['safe'],42)
