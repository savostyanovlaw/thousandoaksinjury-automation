"""Contract tests for the PI intake funnel (issue #158)."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "website"
PHONE_HREF = "tel:+18182138798"


def read(rel):
    return (SITE / rel).read_text(encoding="utf-8")


def form_pages():
    return {p.relative_to(SITE).as_posix(): p.read_text(encoding="utf-8")
            for p in SITE.glob("**/*.html") if 'data-form-integration="pending"' in p.read_text(encoding="utf-8")}


def sitemap_paths():
    xml = read("sitemap.xml")
    return [loc.replace("https://thousandoaksinjury.com/", "") for loc in re.findall(r"<loc>(.*?)</loc>", xml)]


class NativeFormTests(unittest.TestCase):
    def test_every_form_submits_without_javascript(self):
        pages = form_pages()
        self.assertIn("newbury-park/index.html", pages)
        self.assertIn("westlake-village/index.html", pages)
        for rel, html in pages.items():
            form = re.search(r"<form data-form-integration=\"pending\"[^>]*>.*?</form>", html, re.S).group(0)
            with self.subTest(page=rel):
                self.assertIn('action="/api/case-review"', form)
                self.assertIn('method="post"', form)
                self.assertRegex(form, r'<button class="btn btn-primary" type="submit"')
                self.assertNotIn("aria-disabled", form)
                self.assertNotIn("loading", form)
                self.assertNotIn("will be enabled", form)
                for field in ("name", "phone", "message"):
                    self.assertRegex(form, rf'name="{field}"[^>]*\brequired\b')
                self.assertNotRegex(form, r'name="email"[^>]*\brequired\b')
                self.assertRegex(form, r'<input type="hidden" name="language" value="(en|ru)">')
                self.assertRegex(form, r'name="website" tabindex="-1"')

    def test_russian_form_posts_russian_language(self):
        self.assertIn('name="language" value="ru"', read("ru/index.html"))

    def test_status_pages_exist_noindex_and_offer_phone(self):
        for rel in ("thank-you/index.html", "case-review-error/index.html"):
            html = read(rel)
            with self.subTest(page=rel):
                self.assertIn('<meta name="robots" content="noindex, nofollow">', html)
                self.assertIn(PHONE_HREF, html)
                self.assertIn('lang="ru"', html)
                self.assertIn("/assets/lead-events.js", html)
        self.assertNotIn("thank-you/", sitemap_paths())
        self.assertNotIn("case-review-error/", sitemap_paths())


class CallToActionTests(unittest.TestCase):
    def test_single_phone_target_and_sticky_bar_on_every_indexed_page(self):
        for path in sitemap_paths():
            html = read(path + "index.html")
            with self.subTest(page=path or "/"):
                tels = set(re.findall(r'href="(tel:[^"]+)"', html))
                self.assertEqual(tels, {PHONE_HREF})
                self.assertRegex(html, r'class="mobile-action-bar"[^>]*><a href="tel:\+18182138798">')
                self.assertIn("/assets/lead-events.js", html)


class HighIntentSeoTests(unittest.TestCase):
    TARGETS = {
        "": ("Thousand Oaks Personal Injury Lawyer", "Thousand Oaks Personal Injury Attorney"),
        "westlake-village/": ("Westlake Village Personal Injury Lawyer", "Westlake Village Personal Injury Attorney"),
        "newbury-park/": ("Newbury Park Personal Injury Lawyer", "Newbury Park Personal Injury Attorney"),
        "car-accident-lawyer/": ("Thousand Oaks Car Accident Lawyer", "Thousand Oaks Car Accident Lawyer"),
        "dog-bite-lawyer/": ("Thousand Oaks Dog Bite Lawyer", "Thousand Oaks Dog Bite Lawyer"),
    }

    def test_title_and_h1_cover_lawyer_and_attorney_variants(self):
        for path, (title_phrase, h1) in self.TARGETS.items():
            html = read(path + "index.html")
            title = re.search(r"<title>(.*?)</title>", html).group(1)
            with self.subTest(page=path or "/"):
                self.assertTrue(title.startswith(title_phrase), title)
                self.assertLessEqual(len(title), 60)
                self.assertEqual(re.findall(r"<h1[^>]*>(.*?)</h1>", html), [h1])
                desc = re.search(r'name="description" content="([^"]*)"', html).group(1)
                self.assertLessEqual(len(desc), 175)
                self.assertIn(f'<link rel="canonical" href="https://thousandoaksinjury.com/{path}">', html)

    def test_robots_keeps_site_crawlable_but_not_api(self):
        robots = read("robots.txt")
        self.assertIn("Allow: /", robots)
        self.assertIn("Disallow: /api/", robots)
        self.assertIn("Sitemap: https://thousandoaksinjury.com/sitemap.xml", robots)

    def test_homepage_schema_names_the_served_cities(self):
        html = read("index.html")
        for city in ("Thousand Oaks", "Westlake Village", "Newbury Park"):
            self.assertIn('{"@type":"City","name":"%s, CA"}' % city, html)


class TrackingContractTests(unittest.TestCase):
    def test_form_reports_start_success_and_failure_without_fields(self):
        js = read("assets/city-pages.js")
        for token in ("track('form_start'", "track('generate_lead'", "track('form_submit_error'", "toi_first_touch", "elapsed_ms"):
            self.assertIn(token, js)
        for call in re.findall(r"track\('[a-z_]+', \{[^}]*\}", js):
            self.assertNotRegex(call, r"\b(name|phone|email|message)\b\s*:")


if __name__ == "__main__":
    unittest.main()
