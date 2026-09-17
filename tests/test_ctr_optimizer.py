import tempfile
import unittest
from pathlib import Path
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

    def test_missing_description_gets_field_specific_description_proposal(self):
        html='<html><head><title>Thousand Oaks Car Accident Lawyer | Savostyanov Law</title></head></html>'
        r=agent.analyze_html('/car-accidents/',html)
        proposals=r['proposals']
        self.assertTrue(any(p['field']=='meta_description' for p in proposals))
        description=next(p for p in proposals if p['field']=='meta_description')
        self.assertEqual(description['currentValue'],'')
        self.assertTrue(description['proposedValue'])
        self.assertTrue(description['rationale'])

    def test_missing_description_exposes_bounded_suggested_description(self):
        html='<html><head><title>Thousand Oaks Car Accident Lawyer | Savostyanov Law</title></head></html>'
        r=agent.analyze_html('/car-accidents/',html)
        self.assertTrue(r['suggestedDescription'])
        self.assertLessEqual(len(r['suggestedDescription']),160)
        proposal=next(p for p in r['proposals'] if p['field']=='meta_description')
        self.assertEqual(r['suggestedDescription'],proposal['proposedValue'])

    def test_poor_ctr_with_healthy_metadata_is_performance_opportunity(self):
        html='<html><head><title>California Car Accident Lawyer | Savostyanov Law</title><meta name="description" content="Talk with a California personal injury attorney about a car accident claim, insurance issues, evidence, and available next steps."></head></html>'
        performance={'clicks':8,'impressions':1000,'ctr':0.008,'position':6.2,'query':'car accident lawyer california'}
        r=agent.analyze_html('/car-accidents/',html,performance=performance)
        self.assertIn('low_ctr_opportunity',r['issues'])
        self.assertEqual(r['performance']['query'],'car accident lawyer california')
        self.assertTrue(any(p['field']=='title' and 'CTR' in p['rationale'] for p in r['proposals']))

    def test_no_performance_signal_does_not_invent_ctr_issue(self):
        html='<html><head><title>California Car Accident Lawyer | Savostyanov Law</title><meta name="description" content="Talk with a California personal injury attorney about a car accident claim, insurance issues, evidence, and available next steps."></head></html>'
        r=agent.analyze_html('/car-accidents/',html)
        self.assertNotIn('low_ctr_opportunity',r['issues'])
        self.assertEqual(r['mode'],'PROPOSAL_ONLY');self.assertFalse(r['publishAllowed'])

    def test_language_directory_is_not_treated_as_city(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ru=root/'ru';ru.mkdir()
            (ru/'index.html').write_text('<html><head><title>Русскоязычный адвокат | Savostyanov Law</title></head></html>',encoding='utf-8')
            report=agent.scan(root)
        page=next(p for p in report['pages'] if p['path']=='/ru/')
        proposals=' '.join(p['proposedValue'] for p in page['proposals'])
        self.assertNotIn('Ru Personal Injury Lawyer',proposals)
        self.assertNotIn('Ru personal injury attorney',proposals)

if __name__=='__main__': unittest.main()
