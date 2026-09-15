import unittest
from scripts import content_creator as agent

class ContentCreatorTests(unittest.TestCase):
    def test_build_brief_is_deterministic_and_local(self):
        brief=agent.build_brief('rear-end collision','Thousand Oaks')
        self.assertEqual(brief['agent'],'content-creator')
        self.assertIn('Thousand Oaks',brief['title'])
        self.assertGreaterEqual(len(brief['sections']),5)
        self.assertEqual(brief['mode'],'DRAFT_ONLY')
    def test_rejects_unsupported_topic_characters(self):
        with self.assertRaises(ValueError): agent.build_brief('<script>alert(1)</script>','Thousand Oaks')
    def test_brief_contains_legal_review_guardrail(self):
        brief=agent.build_brief('pedestrian accident','Westlake Village')
        self.assertTrue(brief['requiresAttorneyReview'])
        self.assertNotIn('guarantee',brief['draft'].lower())

if __name__=='__main__': unittest.main()
