import unittest
from pathlib import Path


class CaseReviewFormContractTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(__file__).resolve().parents[1]
        self.home = (self.root / "website" / "index.html").read_text(encoding="utf-8")
        self.ru = (self.root / "website" / "ru" / "index.html").read_text(encoding="utf-8")
        self.js = (self.root / "website" / "assets" / "city-pages.js").read_text(encoding="utf-8")
        self.function_path = self.root / "functions" / "api" / "case-review.js"

    def test_pages_function_exists_and_uses_server_side_resend_secret(self):
        self.assertTrue(self.function_path.exists(), "Cloudflare Pages Function is missing")
        source = self.function_path.read_text(encoding="utf-8")
        self.assertIn("RESEND_API_KEY", source)
        self.assertIn("https://api.resend.com/emails", source)
        self.assertIn("attorney@savostyanovlaw.com", source)
        self.assertIn("forms.thousandoaksinjury.com", source)

    def test_english_and_russian_forms_post_to_same_endpoint(self):
        for html in (self.home, self.ru):
            with self.subTest(language="page"):
                self.assertIn('action="/api/case-review"', html)
                self.assertIn('method="post"', html)
                self.assertIn('data-case-review-form', html)
                self.assertIn('type="submit"', html)
                self.assertNotIn('data-form-integration="pending"', html)

    def test_form_progressive_enhancement_and_status_ui_exist(self):
        self.assertIn("[data-case-review-form]", self.js)
        self.assertIn("fetch(form.action", self.js)
        self.assertIn("data-form-status", self.home)
        self.assertIn("data-form-status", self.ru)

    def test_honeypot_is_present(self):
        self.assertIn('name="website"', self.home)
        self.assertIn('name="website"', self.ru)


if __name__ == "__main__":
    unittest.main()
