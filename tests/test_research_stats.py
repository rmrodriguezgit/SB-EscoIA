import unittest,importlib.util
from second_brain.research_worker import quantitative
@unittest.skipUnless(importlib.util.find_spec('scipy'),'entorno estadístico opcional')
class Stats(unittest.TestCase):
 def test_descriptive_missing_multiple(self):
  p={'questions':[{'id':'x','kind':'likert','title':'X'},{'id':'y','kind':'multiple','title':'Y'}],'responses':[{'answers':{'x':1,'y':['A','B']}},{'answers':{'x':3,'y':['A']}}]}
  r=quantitative(p);self.assertEqual(r['metrics'][0]['mean'],2);self.assertAlmostEqual(r['metrics'][0]['sd'],2**.5);self.assertEqual(r['metrics'][1]['percentages']['A'],100);self.assertEqual(r['metrics'][0]['frequencies']['5'],0)
 def test_chi_expected_reject(self):
  p={'questions':[{'id':k,'kind':'single','title':k} for k in ['x','y']],'responses':[{'answers':{'x':i%2,'y':i//2}} for i in range(4)],'hypothesis':{'test':'chi2','x':'x','y':'y','statement':'Independencia'}}
  self.assertEqual(quantitative(p)['inferential']['status'],'assumptions_failed')
 def test_regression_known_slope(self):
  p={'questions':[{'id':k,'kind':'likert','title':k} for k in ['x','y']],'responses':[{'answers':{'x':i,'y':i}} for i in range(1,6)],'hypothesis':{'test':'regression','x':'x','y':'y','statement':'Pendiente cero'}}
  r=quantitative(p)['inferential'];self.assertEqual(r['effect']['slope'],1);self.assertEqual(r['effect']['r_squared'],1)
