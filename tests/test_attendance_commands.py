import unittest
from second_brain.attendance_commands import requested,resolve_target
class AttendanceCommandsTest(unittest.TestCase):
 def setUp(self):
  self.students=[{'id':358,'number':'90001','name':'Pérez Gómez Ana Lucía'}]
  self.teachers=[{'id':2,'name':'José Martín López Ruiz'}]
  self.offers=[{'id':11,'group_code':'LAN-201','teacher_id':2}]
  self.q='Quita de la lista LAN201 del docente José Martín López Ruiz al alumno 16 90001 Pérez Gómez Ana Lucía'
 def test_administrative_not_curricular(self):
  self.assertTrue(requested(self.q));self.assertFalse(requested('Dame temas y subtemas de LAN201'))
 def test_exact_target(self):
  s,o,t=resolve_target(self.q,self.students,self.offers,self.teachers)
  self.assertEqual((s['id'],o['id'],t['id']),(358,11,2))
 def test_missing_teacher_and_number_rejected(self):
  for q in [self.q.replace('José Martín López Ruiz','otro docente'),self.q.replace('90001','99999')]:
   with self.assertRaises(ValueError):resolve_target(q,self.students,self.offers,self.teachers)
 def test_ambiguous_lists_not_executed(self):
  with self.assertRaises(ValueError):resolve_target(self.q,self.students,self.offers+self.offers,self.teachers)
