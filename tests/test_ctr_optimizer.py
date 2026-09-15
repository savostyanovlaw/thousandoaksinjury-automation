import unittest
from scripts import ctr_optimizer as agent

class CtrOptimizerTests(unittest.TestCase):
    def test_flags_long_title_and_missing_description(self):
        html='<html><head><title>'+('X'*70)+'</title></head><body><h1>Page</h1></body></html>'
        r=agent.analyze_html('/x/',html)
        self.assertIn('title_too_long',r['issues']);self.assertIn('missing_meta_description',r['issues'])

    def test_suggestions_are_proposals_only(self):
        html='<html><head><title>Thousand Oaks Injury Lawyer | Savostyanov Law</title><meta name="description" content="Speak directly with a Thousand Oaks personal injury attorney about your California injury claim and available next steps."></head><body></body></html>'
        r=agent.analyze_html('/',html)
        self.assertEqual(r['mode'],'PROPOSAL_ONLY');self.assertFalse(r['publishAllowed'])

    def test_meta_description_attribute_order_is_irrelevant(self):
        text='Speak directly with a Thousand Oaks personal injury attorney about your California injury claim and available next steps.'
        html=f'<html><head><title>Thousand Oaks Injury Lawyer | Savostyanov Law</title><meta content="{text}" name="description"></head></html>'
        r=agent.analyze_html('/',html)
        self.assertEqual(r['currentDescription'],text)
        self.assertNotIn('missing_meta_description',r['issues'])

    def test_title_candidate_respects_length(self):
        s=agent.suggest_title('westlake-village','Westlake Village')
        self.assertLessEqual(len(s),60);self.assertIn('Westlake Village',s)

if __name__=='__main__': unittest.main()
