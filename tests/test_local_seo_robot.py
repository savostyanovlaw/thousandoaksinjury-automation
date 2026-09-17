import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from scripts import local_seo_robot as agent

GOOD='''<html><head><title>Westlake Village Personal Injury Lawyer | Savostyanov Law</title><meta name="description" content="Local personal injury representation in Westlake Village, California. Call Savostyanov Law for a case review."><link rel="canonical" href="https://thousandoaksinjury.com/westlake-village/"><script type="application/ld+json">{"@type":"LegalService","areaServed":"Westlake Village"}</script></head><body><h1>Westlake Village Personal Injury Lawyer</h1><a href="tel:+18182138798">Call</a><a href="mailto:attorney@savostyanovlaw.com">Email</a></body></html>'''

class LocalSeoRobotTests(unittest.TestCase):
    def test_analyze_page_accepts_local_signals(self):
        row=agent.analyze_page('westlake-village',GOOD)
        self.assertEqual(row['issues'],[])
        self.assertEqual(row['city'],'Westlake Village')
    def test_analyze_page_flags_missing_local_signals(self):
        row=agent.analyze_page('westlake-village','<html><head><title>Short</title></head><body><h1>Lawyer</h1></body></html>')
        self.assertTrue({'missing_city_in_title','missing_meta_description','missing_canonical','missing_legalservice_schema','missing_phone','missing_email'} <= set(row['issues']))
    def test_scan_writes_no_site_files(self):
        with TemporaryDirectory() as d:
            root=Path(d); page=root/'westlake-village'; page.mkdir(); (page/'index.html').write_text(GOOD,encoding='utf-8')
            before=(page/'index.html').read_text(encoding='utf-8')
            report=agent.scan(root,['westlake-village'])
            self.assertEqual(report['agent'],'local-seo-robot')
            self.assertEqual((page/'index.html').read_text(encoding='utf-8'),before)

if __name__=='__main__': unittest.main()
