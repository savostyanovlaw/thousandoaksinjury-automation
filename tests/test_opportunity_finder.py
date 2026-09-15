import unittest
from unittest.mock import patch
from scripts import opportunity_finder as agent

HTML='''<html><head><title>Thousand Oaks Personal Injury Attorney | Savostyanov Law</title></head><body><h1>Personal Injury Attorney</h1><p>{}</p><a href="/a">A</a><a href="/b">B</a><a href="/c">C</a></body></html>'''.format('word '*400)

class OpportunityFinderTests(unittest.TestCase):
    @patch('scripts.opportunity_finder.fetch', return_value=HTML)
    def test_healthy_page(self,_):
        r=agent.analyze('https://example.com',['/'])
        self.assertEqual(r['status'],'HEALTHY'); self.assertEqual(r['findingCount'],0)
    @patch('scripts.opportunity_finder.fetch', return_value='<html><body><h1>A</h1></body></html>')
    def test_flags_actionable_gaps(self,_):
        types={x['type'] for x in agent.analyze('https://example.com',['/'])['findings']}
        self.assertTrue({'missing_title','thin_content','weak_internal_linking'} <= types)

if __name__=='__main__': unittest.main()
