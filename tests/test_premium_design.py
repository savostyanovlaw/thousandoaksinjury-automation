import unittest
from pathlib import Path


class PremiumDesignSystemTests(unittest.TestCase):
    def setUp(self):
        self.css = (Path(__file__).resolve().parents[1] / "website" / "assets" / "city-pages.css").read_text(encoding="utf-8")

    def test_required_premium_selectors_exist(self):
        for selector in (
            ".brand-lockup", ".hero-copy", ".hero-portrait", ".trust-strip",
            ".practice-editorial", ".cinematic-section", ".process-steps",
            ".attorney-editorial", ".review-shell", ".case-review",
            ".mobile-action-bar", ".reveal",
        ):
            with self.subTest(selector=selector):
                self.assertIn(selector, self.css)

    def test_exact_premium_tokens_and_reduced_motion_exist(self):
        for token in (
            "--ink: #111c30", "--ink-deep: #091321", "--ivory: #f7f3ec",
            "--paper: #fffdf9", "--bronze: #a7824b", "--bronze-dark: #7f6237",
            "--content: 1240px", "--text-measure: 720px",
            "@media (prefers-reduced-motion: reduce)",
        ):
            with self.subTest(token=token):
                self.assertIn(token, self.css)


if __name__ == "__main__":
    unittest.main()
