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

    def test_existing_english_and_russian_forms_have_required_intake_fields(self):
        for html in (self.home, self.ru):
            with self.subTest(language="page"):
                self.assertIn('data-form-integration="pending"', html)
                for field in ('name="name"', 'name="phone"', 'name="email"', 'name="message"'):
                    self.assertIn(field, html)

    def test_shared_js_enables_and_submits_both_forms(self):
        for token in (
            'form[data-form-integration="pending"]',
            "form.action = '/api/case-review'",
            "form.method = 'post'",
            "button.type = 'submit'",
            "fetch(form.action",
            "data-form-status",
        ):
            with self.subTest(token=token):
                self.assertIn(token, self.js)

    def test_honeypot_is_added_by_shared_js(self):
        self.assertIn("honeypot.name = 'website'", self.js)
        self.assertIn("honeypot.tabIndex = -1", self.js)


if __name__ == "__main__":
    unittest.main()
