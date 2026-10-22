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
        r=agent.analyze('https://example.com',['/'])
        types={x['type'] for x in r['findings']}
        self.assertTrue({'missing_title','thin_content','weak_internal_linking'} <= types)
        self.assertEqual(r['mode'],'PROPOSAL_ONLY')
        self.assertFalse(r['publishAllowed'])
        self.assertTrue(r['requiresAttorneyReview'])

    @patch('scripts.opportunity_finder.fetch', return_value='<html><body><h1>A</h1></body></html>')
    def test_findings_are_prioritized_reviewable_proposals(self,_):
        findings=agent.analyze('https://example.com',['/'])['findings']
        self.assertGreater(len(findings),0)
        for finding in findings:
            self.assertIn(finding['priority'], {'HIGH','MEDIUM','LOW'})
            self.assertTrue(finding['reason'])
            self.assertTrue(finding['recommendedAction'])
            self.assertEqual(finding['approvalStatus'],'PENDING_ATTORNEY_REVIEW')

    @patch('scripts.opportunity_finder.fetch', side_effect=TimeoutError('timeout'))
    def test_fetch_failure_is_not_a_content_recommendation(self,_):
        r=agent.analyze('https://example.com',['/'])
        self.assertEqual(r['status'],'NEEDS ATTENTION')
        finding=r['findings'][0]
        self.assertEqual(finding['type'],'fetch_failed')
        self.assertEqual(finding['priority'],'HIGH')
        self.assertIn('retry',finding['recommendedAction'].lower())

    def test_structural_findings_remain_distinct_from_content_findings(self):
        self.assertNotEqual(agent.RULES["h1_count"][2], agent.RULES["thin_content"][2])
        self.assertIn("internal links", agent.RULES["weak_internal_linking"][2].lower())

    def test_topic_for_practice_area_page_is_a_real_legal_topic_not_the_issue_type(self):
        topic,city=agent.topic_and_city_for_url('https://thousandoaksinjury.com/dog-bite-lawyer/')
        self.assertEqual(topic,'dog bite')
        self.assertNotIn('review',topic)
        self.assertNotIn('_',topic)
        self.assertEqual(city,'Thousand Oaks')

    def test_topic_for_city_page_uses_the_city_and_a_generic_pi_topic(self):
        topic,city=agent.topic_and_city_for_url('https://thousandoaksinjury.com/camarillo/')
        self.assertEqual(topic,'personal injury')
        self.assertEqual(city,'Camarillo')

    def test_topic_for_homepage_falls_back_to_default_city(self):
        topic,city=agent.topic_and_city_for_url('https://thousandoaksinjury.com/')
        self.assertEqual(topic,'personal injury')
        self.assertEqual(city,'Thousand Oaks')

if __name__=='__main__': unittest.main()
