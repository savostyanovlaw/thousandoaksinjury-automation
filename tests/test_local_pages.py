import unittest
from pathlib import Path


class LocalPageTemplateTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        self.newbury = (root / "website" / "newbury-park" / "index.html").read_text(encoding="utf-8")

    def test_newbury_park_uses_premium_local_template(self):
        for marker in (
            'class="brand-lockup"', 'data-nav-panel', 'data-nav-toggle',
            'class="hero-copy', 'class="hero-portrait', 'class="trust-strip',
            'class="cinematic-section', 'class="attorney-editorial',
            'class="case-review', 'mailto:attorney@savostyanovlaw.com',
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, self.newbury)

    def test_newbury_park_has_no_unapproved_fee_or_text_claims(self):
        lower = self.newbury.lower()
        self.assertNotIn("no fee unless we recover compensation", lower)
        self.assertNotIn("call or text anytime", lower)


if __name__ == "__main__":
    unittest.main()
