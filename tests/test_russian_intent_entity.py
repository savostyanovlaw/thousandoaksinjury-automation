"""Russian-speaking PI intent (issues #41, #162) and firm-entity language consistency (#165)."""
import json
import re
import unittest
from html import unescape
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "website"
PAGES = {p.relative_to(SITE).as_posix(): p.read_text(encoding="utf-8") for p in SITE.glob("**/*.html")}
FIRM_URL = "https://thousandoaksinjury.com/"


def json_ld_items(html):
    for block in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        data = json.loads(block)
        items = data.get("@graph", [data]) if isinstance(data, dict) else data
        yield from items


def is_legal_service(item):
    kind = item.get("@type")
    return kind == "LegalService" or (isinstance(kind, list) and "LegalService" in kind)


class HomepageRussianIntentTests(unittest.TestCase):
    """GSC Oct 1-14: 'russian personal injury attorney in sherman oaks' (English query) ranks
    ~7.2 on the English homepage with 0 clicks, but the homepage snippet never says Russian."""

    def setUp(self):
        self.html = PAGES["index.html"]
        self.desc = unescape(re.search(r'name="description" content="([^"]*)"', self.html).group(1))

    def test_meta_description_states_russian_language_once(self):
        self.assertEqual(self.desc.lower().count("russian"), 1)
        self.assertIn("English or Russian", self.desc)

    def test_meta_description_keeps_primary_local_intent_and_fits_snippet(self):
        self.assertTrue(self.desc.startswith("Thousand Oaks personal injury lawyer"))
        self.assertIn("Free consultation", self.desc)
        self.assertLessEqual(len(self.desc), 160)

    def test_title_and_h1_unchanged(self):
        # Homepage ranks ~9-15 for core Thousand Oaks PI queries; do not disturb these signals.
        self.assertIn("<title>Thousand Oaks Personal Injury Lawyer | Savostyanov Law</title>", self.html)
        h1 = re.sub(r"<[^>]+>", "", re.search(r"<h1[^>]*>(.*?)</h1>", self.html, re.S).group(1)).strip()
        self.assertEqual(h1, "Thousand Oaks Personal Injury Attorney")

    def test_no_unverified_office_or_location_claims(self):
        self.assertNotIn("Sherman Oaks", self.html)


class FirmEntityLanguageTests(unittest.TestCase):
    """Every LegalService node describing the firm entity must state the same languages."""

    def test_every_firm_legal_service_declares_english_and_russian(self):
        checked = 0
        for rel, html in PAGES.items():
            for item in json_ld_items(html):
                if is_legal_service(item) and item.get("url") == FIRM_URL:
                    checked += 1
                    with self.subTest(page=rel):
                        self.assertEqual(set(item.get("knowsLanguage") or []), {"en", "ru"})
        self.assertGreaterEqual(checked, 14)

    def test_city_pages_declare_languages(self):
        for city in ("westlake-village", "agoura-hills", "newbury-park", "oak-park", "camarillo", "simi-valley"):
            with self.subTest(city=city):
                services = [i for i in json_ld_items(PAGES[f"{city}/index.html"]) if is_legal_service(i)]
                self.assertEqual(len(services), 1)
                self.assertEqual(services[0].get("knowsLanguage"), ["en", "ru"])


if __name__ == "__main__":
    unittest.main()
