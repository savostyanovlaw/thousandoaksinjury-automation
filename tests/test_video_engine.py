import unittest
from scripts import video_engine as agent

class VideoEngineTests(unittest.TestCase):
    def test_builds_short_form_brief(self):
        r=agent.build_brief('rear-end injuries','Thousand Oaks')
        self.assertEqual(r['agent'],'video-engine');self.assertEqual(r['mode'],'BRIEF_ONLY');self.assertGreaterEqual(len(r['scenes']),4)
        self.assertIn('Thousand Oaks',r['title'])
    def test_requires_attorney_review_and_never_publishes(self):
        r=agent.build_brief('dog bite claim','California')
        self.assertTrue(r['requiresAttorneyReview']);self.assertFalse(r['publishAllowed'])
    def test_rejects_markup_input(self):
        with self.assertRaises(ValueError):agent.build_brief('<script>x</script>','California')

if __name__=='__main__': unittest.main()
