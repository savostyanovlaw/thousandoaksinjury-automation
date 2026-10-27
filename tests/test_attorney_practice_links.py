"""Ensure the attorney profile links visitors to existing PI intake resources."""
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "website" / "attorney" / "alexey-savostyanov" / "index.html"
PAGES = (
    "car-accident-lawyer",
    "motorcycle-accident-lawyer",
    "rideshare-accident-lawyer",
    "delivery-driver-injury-lawyer",
    "dog-bite-lawyer",
    "slip-and-fall-lawyer",
    "wrongful-death-lawyer",
)


class AttorneyPracticeLinksTests(unittest.TestCase):
    def test_profile_links_existing_practice_pages(self):
        html = PROFILE.read_text(encoding="utf-8")
        for slug in PAGES:
            with self.subTest(practice=slug):
                self.assertTrue((ROOT / "website" / slug / "index.html").is_file())
                self.assertIn(f'href="/{slug}/"', html)

    def test_direct_phone_contact_remains_available(self):
        html = PROFILE.read_text(encoding="utf-8")
        self.assertIn('href="tel:+18182138798"', html)
        self.assertIn("(818) 213-8798", html)


if __name__ == "__main__":
    unittest.main()
