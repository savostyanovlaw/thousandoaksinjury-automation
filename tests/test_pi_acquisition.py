"""Issue #160: NAP consistency and evidence-based query coverage."""
import re
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "website"
PAGES = {p.relative_to(SITE).as_posix(): p.read_text(encoding="utf-8") for p in SITE.glob("**/*.html")}


class NapTests(unittest.TestCase):
    def test_every_address_includes_suite_235(self):
        for rel, html in PAGES.items():
            with self.subTest(page=rel):
                for match in re.finditer(r"2629 Townsgate Rd[^<\"]{0,12}", html):
                    self.assertTrue(match.group(0).startswith("2629 Townsgate Rd, Suite 235"), match.group(0))
                for street in re.findall(r'"streetAddress":"([^"]*)"', html):
                    self.assertEqual(street, "2629 Townsgate Rd, Suite 235")
                self.assertNotIn("+18182138798x", html)
                if "postalCode" in html:
                    self.assertIn('"postalCode":"91361"', html)
                    self.assertIn('"telephone":"+18182138798"', html)


class QueryCoverageTests(unittest.TestCase):
    def test_car_accident_page_covers_attorney_variant_once_without_stuffing(self):
        html = PAGES["car-accident-lawyer/index.html"]
        text = re.sub(r"<[^>]+>", " ", html.split("<body", 1)[1]).lower()
        self.assertEqual(text.count("car accident attorney"), 1)
        desc = re.search(r'name="description" content="([^"]*)"', html).group(1)
        self.assertIn("car accident attorney", desc.lower())
        self.assertEqual(re.findall(r"<h1[^>]*>(.*?)</h1>", html), ["Thousand Oaks Car Accident Lawyer"])
        self.assertIn("<title>Thousand Oaks Car Accident Lawyer | Savostyanov Law</title>", html)


if __name__ == "__main__":
    unittest.main()
