import json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from second_brain import research
from second_brain.core import Brain

ROOT=Path(__file__).resolve().parents[1]
PY=ROOT/'.venv-research/bin/python'
WORKER=ROOT/'src/second_brain/research_worker.py'

def run(payload):
 r=subprocess.run([str(PY),str(WORKER)],input=json.dumps({**payload,'action':'test'}),text=True,capture_output=True,timeout=60)
 data=json.loads(r.stdout)
 if r.returncode:raise ValueError(data['error'])
 return data

@unittest.skipUnless(PY.exists(),'entorno estadístico .venv-research no instalado')
class HypothesisTests(unittest.TestCase):
 A=[5,6,7,8,6,7];B=[3,4,5,4,3,5];C=[6,7,8,9,8,9]
 def test_all_thirteen_tests_compute(self):
  cases={'t_one':{'x':self.A,'mu':5},'t_ind':{'groups':{'a':self.A,'b':self.B}},'welch':{'groups':{'a':self.A,'b':self.B}},
   't_paired':{'x':self.A,'y':self.B},'anova':{'groups':{'a':self.A,'b':self.B,'c':self.C}},'pearson':{'x':self.A,'y':self.C},
   'regression':{'x':[1,2,3,4,5],'y':[2,4.1,5.9,8.2,10]},'mannwhitney':{'groups':{'a':self.A,'b':self.B}},'wilcoxon':{'x':self.A,'y':self.B},
   'kruskal':{'groups':{'a':self.A,'b':self.B,'c':self.C}},'spearman':{'x':self.A,'y':self.C},
   'chi2_ind':{'table':[[20,15],[10,25]]},'chi2_gof':{'observed':[30,20,10]}}
  for test,data in cases.items():
   with self.subTest(test=test):
    r=run({'test':test,**data})
    self.assertEqual(r['status'],'calculated')
    self.assertTrue(0<=r['p']<=1)
    self.assertIn('value',r['effect']);self.assertTrue(r['assumptions'])
    self.assertIn(r['decision'],{'Se rechaza H0','No se rechaza H0'})
 def test_known_values(self):
  r=run({'test':'t_one','x':[1,2,3,4,5],'mu':3});self.assertAlmostEqual(r['statistic'],0);self.assertAlmostEqual(r['p'],1)
  r=run({'test':'regression','x':[1,2,3,4,5],'y':[3,5,7,9,11]});self.assertAlmostEqual(r['descriptives']['pendiente'],2);self.assertAlmostEqual(r['effect']['value'],1)
  r=run({'test':'chi2_gof','observed':[25,25,25,25]});self.assertAlmostEqual(r['statistic'],0);self.assertEqual(r['df'],3)
  r=run({'test':'chi2_ind','table':[[20,15],[10,25]]});self.assertAlmostEqual(r['statistic'],5.833,places=2)
 def test_guards(self):
  with self.assertRaisesRegex(ValueError,'mismo tamaño'):run({'test':'t_paired','x':[1,2,3],'y':[1,2]})
  with self.assertRaisesRegex(ValueError,'dos grupos'):run({'test':'t_ind','groups':{'a':[1,2],'b':[1,2],'c':[3,4]}})
  with self.assertRaisesRegex(ValueError,'no permitida'):run({'test':'magia','x':[1]})
  r=run({'test':'chi2_ind','table':[[2,1],[1,2]]});self.assertTrue(any('esperada' in w for w in r['warnings']))

class Interpretation(unittest.TestCase):
 RESULT={'status':'calculated','label':'t de Student','statistic':4.4426,'p':0.00125,'df':10,'n':12,'alpha':0.05,'effect':{'name':'g','value':2.37,'magnitude':'grande'},'decision':'Se rechaza H0','interpretation':'determinista'}
 def _with(self,text):
  with tempfile.TemporaryDirectory() as d:
   b=Brain(d)
   with patch('second_brain.runtime.ollama',return_value={'message':{'content':text}}),patch('second_brain.runtime.assert_resources'),patch('second_brain.runtime.local_model',return_value='llmlx:qwen3.5:4b'):
    out=research.interpret(b,self.RESULT);b.close();return out
 def test_grounded_text_is_kept(self):
  out=self._with('La prueba t (t = 4.44, gl = 10, p = 0.001) rechaza H0 con un efecto grande (g = 2.37).')
  self.assertEqual(out['engine'],'llmlx:qwen3.5:4b')
 def test_invented_number_is_rejected(self):
  out=self._with('El 87 % del alumnado mejoró (t = 4.44, p = 0.001).')
  self.assertEqual(out['engine'],'determinista');self.assertEqual(out['text'],'determinista');self.assertIn('87',out['note'])

class Ownership(unittest.TestCase):
 def test_teacher_sees_only_own_studies(self):
  with tempfile.TemporaryDirectory() as d:
   b=Brain(d);base={'title':'T','question':'Q','objective':'O'}
   with patch.object(research,'owner',return_value=(5,'teacher')):mine=research.create(b,base)
   with patch.object(research,'owner',return_value=(6,'teacher')):
    other=research.create(b,base)
    self.assertEqual([s['id'] for s in research.visible(b)],[other['id']])
    with self.assertRaisesRegex(ValueError,'otro docente'):research.get(b,mine['id'])
   with patch.object(research,'owner',return_value=(1,'admin')):self.assertEqual(len(research.visible(b)),2)
   b.close()
