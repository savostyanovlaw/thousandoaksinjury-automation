import unittest
from unittest.mock import patch
from scripts import competitor_monitor as agent

class Tests(unittest.TestCase):
    @patch('scripts.competitor_monitor.fetch', return_value='<title>Example Injury Lawyers</title><h1>Hello</h1>')
    def test_snapshot(self,_):
        r=agent.analyze(['https://example.com'])
        self.assertEqual(r['available'],1); self.assertEqual(r['competitors'][0]['title'],'Example Injury Lawyers'); self.assertEqual(len(r['competitors'][0]['contentHash']),16)
    @patch('scripts.competitor_monitor.fetch', side_effect=TimeoutError())
    def test_failure_is_reported_not_fatal(self,_):
        r=agent.analyze(['https://example.com']); self.assertEqual(r['unavailable'],1); self.assertEqual(r['competitors'][0]['status'],'UNAVAILABLE')
if __name__=='__main__': unittest.main()
