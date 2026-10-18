import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("gsc", ROOT / "scripts" / "gsc_query_page_audit.py")
gsc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gsc)


def row(q, page, clicks, imps, pos):
    return {"keys": [q, "https://thousandoaksinjury.com" + page], "clicks": clicks, "impressions": imps, "position": pos}


class GscAuditTests(unittest.TestCase):
    def test_classifies_pi_and_non_pi_queries(self):
        self.assertEqual(gsc.classify("car accident attorney thousand oaks"), "Car accident")
        self.assertEqual(gsc.classify("personal injury lawyer newbury park"), "PI core")
        self.assertEqual(gsc.classify("business lawyer"), "NON-PI: business")
        self.assertEqual(gsc.classify("адвокат по дтп"), "Russian")
        self.assertIsNone(gsc.classify("thousand oaks weather"))

    def test_report_compares_periods_with_weighted_position_and_landing_pages(self):
        cur = [row("car accident attorney thousand oaks", "/car-accident-lawyer/", 1, 20, 40),
               row("car accident attorney thousand oaks", "/", 0, 6, 70),
               row("business lawyer", "/", 0, 500, 30)]
        prev = [row("car accident attorney thousand oaks", "/car-accident-lawyer/", 0, 10, 60)]
        text = gsc.report(cur, prev, "c", "p")
        # 26 impressions, weighted position (20*40 + 6*70) / 26 = 46.9
        self.assertIn("| Car accident | local | 1 | 26 | 3.85% | 46.9 | 0 | 10 | 0.00% | 60.0 |", text)
        self.assertIn("| NON-PI: business | all | 0 | 500 | 0.00% | 30.0 |", text)
        self.assertIn("| Car accident | car accident attorney thousand oaks | /car-accident-lawyer/ | 1 | 20 | 5.0% | 40.0 | 10 | 60.0 |", text)
        self.assertIn("Impressions are not visits", text)

    def test_offline_json_files(self):
        with tempfile.TemporaryDirectory() as d:
            c, p = Path(d, "c.json"), Path(d, "p.json")
            c.write_text(json.dumps({"rows": [row("dog bite lawyer thousand oaks", "/dog-bite-lawyer/", 0, 3, 12)]}))
            p.write_text(json.dumps({"rows": []}))
            self.assertEqual(len(gsc.load(c)), 1)
            self.assertEqual(gsc.load(p), [])


if __name__ == "__main__":
    unittest.main()
