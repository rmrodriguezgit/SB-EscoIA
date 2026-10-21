import unittest
from second_brain.runtime import memory_budget

class MemoryBudgetTests(unittest.TestCase):
    def stats(self,anonymous=380370,wired=189713,compressed=72883,file_backed=360401):
        return f"Mach Virtual Memory Statistics: (page size of 16384 bytes)\nAnonymous pages: {anonymous}.\nPages wired down: {wired}.\nPages occupied by compressor: {compressed}.\nFile-backed pages: {file_backed}.\n"
    def test_reclaimable_cache_does_not_change_budget(self):
        first=memory_budget(self.stats(file_backed=1),2.5)
        second=memory_budget(self.stats(file_backed=900000),2.5)
        self.assertEqual(first,second)
        self.assertLess(first['projected_gib'],12.5)
    def test_anonymous_inactive_memory_still_counts(self):
        with self.assertRaises(RuntimeError):memory_budget(self.stats(anonymous=600000),2.5)
    def test_pressure_blocks_even_with_small_workload(self):
        with self.assertRaises(RuntimeError):memory_budget(self.stats(anonymous=1,wired=1,compressed=1),0.5,pressure=2)
    def test_larger_model_reserve_blocks(self):
        with self.assertRaises(RuntimeError):memory_budget(self.stats(),5.5)
