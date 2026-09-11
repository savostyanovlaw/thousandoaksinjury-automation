import unittest
from pathlib import Path


LOCAL_PAGES = (
    "agoura-hills",
    "camarillo",
    "newbury-park",
    "oak-park",
    "simi-valley",
    "westlake-village",
)

PREMIUM_MARKERS = (
    'class="brand-lockup"',
    'data-nav-panel',
    'data-nav-toggle',
    'class="hero-copy',
    'class="hero-portrait',
    'class="trust-strip',
    'class="cinematic-section',
    'attorney-editorial',
    'class="case-review',
    'mailto:attorney@savostyanovlaw.com',
)

BANNED_LOCAL_COPY = (
    "no fee unless we recover compensation",
    "no fee unless we win",
    "call or text anytime",
    "4.9/5",
    "millions recovered",
    "success rate",
)


class LocalPageTemplateTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        self.pages = {
            slug: (root / "website" / slug / "index.html").read_text(encoding="utf-8")
            for slug in LOCAL_PAGES
        }

    def test_all_local_pages_use_premium_local_template(self):
        for slug, html in self.pages.items():
            for marker in PREMIUM_MARKERS:
                with self.subTest(slug=slug, marker=marker):
                    self.assertIn(marker, html)

    def test_all_local_pages_have_no_unapproved_fee_text_or_result_claims(self):
        for slug, html in self.pages.items():
            lower = html.lower()
            for phrase in BANNED_LOCAL_COPY:
                with self.subTest(slug=slug, phrase=phrase):
                    self.assertNotIn(phrase, lower)

    def test_all_local_pages_keep_visible_phone_email_and_single_h1(self):
        for slug, html in self.pages.items():
            lower = html.lower()
            with self.subTest(slug=slug):
                self.assertIn('tel:+18182138798', lower)
                self.assertIn('mailto:attorney@savostyanovlaw.com', lower)
                self.assertEqual(lower.count('<h1'), 1)


if __name__ == "__main__":
    unittest.main()
