import unittest
from unittest.mock import patch
from scripts import competitor_monitor as agent

HTML = '''<html><head><title>Example Injury Lawyers</title><meta name="description" content="California injury help"></head><body><h1>Car Accident Lawyer</h1><h2>Free Consultation</h2><a href="/car-accident/">Car Accidents</a><a href="https://external.example/x">External</a></body></html>'''

class Tests(unittest.TestCase):
    @patch('scripts.competitor_monitor.fetch', return_value=HTML)
    def test_snapshot(self,_):
        r=agent.analyze(['https://example.com'])
        row=r['competitors'][0]
        self.assertEqual(r['agent'],'competitor-monitor')
        self.assertEqual(r['mode'],'MONITOR_ONLY')
        self.assertFalse(r['publishAllowed'])
        self.assertEqual(r['available'],1)
        self.assertEqual(row['title'],'Example Injury Lawyers')
        self.assertEqual(row['metaDescription'],'California injury help')
        self.assertEqual(row['h1'],['Car Accident Lawyer'])
        self.assertIn('/car-accident/',row['internalPaths'])
        self.assertEqual(len(row['contentHash']),16)

    @patch('scripts.competitor_monitor.fetch', side_effect=TimeoutError())
    def test_failure_is_reported_not_fatal(self,_):
        r=agent.analyze(['https://example.com'])
        self.assertEqual(r['unavailable'],1)
        self.assertEqual(r['competitors'][0]['status'],'UNAVAILABLE')

    @patch('scripts.competitor_monitor.fetch', return_value=HTML)
    def test_findings_compare_with_previous_snapshot(self,_):
        previous={'competitors':[{'url':'https://example.com','contentHash':'oldhash','title':'Old Title','metaDescription':'Old description','h1':['Old H1'],'internalPaths':[]}]}
        r=agent.analyze(['https://example.com'], previous=previous)
        finding=r['findings'][0]
        self.assertEqual(finding['url'],'https://example.com')
        self.assertIn('content',finding['changedFields'])
        self.assertIn('title',finding['changedFields'])
        self.assertIn('metaDescription',finding['changedFields'])
        self.assertIn('h1',finding['changedFields'])
        self.assertIn('internalPaths',finding['changedFields'])
        self.assertTrue(finding['requiresReview'])

if __name__=='__main__': unittest.main()
