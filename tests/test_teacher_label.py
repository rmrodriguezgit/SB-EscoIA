import unittest
from second_brain.program_metadata import extract
class TeacherLabel(unittest.TestCase):
 def test_combined_label_preserves_name(self):
  data=extract('Crear LAN106 grupo 101 Administración SEM AGO-DIC 2026 maestro o docente Alejandro Silva')
  self.assertEqual(data['teacher'],'Alejandro Silva')
  self.assertEqual(data['group'],'101')
