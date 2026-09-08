import unittest
from pathlib import Path


class SharedInteractionContractTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[1]
        self.js = (root / "website" / "assets" / "city-pages.js").read_text(encoding="utf-8")
        self.video_js = (root / "website" / "assets" / "video-gallery.js").read_text(encoding="utf-8")

    def test_accessible_navigation_contract(self):
        for token in (
            "[data-nav-toggle]", "[data-nav-panel]", "aria-expanded",
            "Escape", "classList.toggle('is-open'",
        ):
            with self.subTest(token=token):
                self.assertIn(token, self.js)

    def test_progressive_enhancement_contract(self):
        for token in (
            "is-scrolled", "[data-practice-trigger]", "[data-practice-image]",
            "IntersectionObserver", "prefers-reduced-motion", "is-visible",
        ):
            with self.subTest(token=token):
                self.assertIn(token, self.js)

    def test_privacy_contract_is_preserved(self):
        self.assertIn("toi_cookie_consent", self.js)
        self.assertIn("G-2QSCB196HW", self.js)
        self.assertIn("youtube-nocookie.com", self.video_js)


if __name__ == "__main__":
    unittest.main()
