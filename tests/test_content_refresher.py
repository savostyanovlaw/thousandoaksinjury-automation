import unittest
from scripts import content_refresher as agent

class ContentRefresherTests(unittest.TestCase):
    def test_old_thin_page_gets_high_priority(self):
        html='<html><head><title>Old page</title></head><body><h1>Old</h1><p>'+'word '*100+'</p></body></html>'
        r=agent.analyze_html('/old/',html,age_days=400)
        self.assertEqual(r['priority'],'HIGH');self.assertIn('stale',r['reasons']);self.assertIn('thin_content',r['reasons'])
    def test_recent_substantial_page_not_forced_to_refresh(self):
        html='<html><head><title>Current Personal Injury Guidance in California</title></head><body><h1>Guide</h1><p>'+'word '*900+'</p></body></html>'
        r=agent.analyze_html('/guide/',html,age_days=30)
        self.assertEqual(r['priority'],'NONE')
    def test_mode_is_proposal_only(self):
        self.assertFalse(agent.analyze_html('/', '<html></html>', 1)['publishAllowed'])

if __name__=='__main__': unittest.main()
