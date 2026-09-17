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
        self.assertFalse(brief['publishAllowed'])
        self.assertNotIn('guarantee',brief['draft'].lower())

    def test_sections_have_substantive_topic_specific_copy(self):
        topic='rear-end collision'
        brief=agent.build_brief(topic,'Thousand Oaks')
        self.assertEqual(len(brief['sectionDrafts']),len(brief['sections']))
        bodies=[section['body'] for section in brief['sectionDrafts']]
        self.assertTrue(all(len(body)>=120 for body in bodies))
        self.assertTrue(any(topic in body.lower() for body in bodies))
        self.assertTrue(all('Draft guidance for attorney review.' not in body for body in bodies))

    def test_draft_preserves_authority_review_without_inventing_law(self):
        brief=agent.build_brief('dog bite','Camarillo')
        draft=brief['draft'].lower()
        self.assertIn('attorney review',draft)
        self.assertIn('verify',draft)
        self.assertNotIn('guaranteed',draft)
        self.assertNotIn('always entitled',draft)

if __name__=='__main__': unittest.main()
