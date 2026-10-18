"""Regression checks for issue #155 (qualified PI calls and intakes)."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "website"
PHONE_HREF = 'href="tel:+18182138798"'
PHONE_TEXT = "(818) 213-8798"
PRACTICE_PAGES = (
    "/car-accident-lawyer/",
    "/dog-bite-lawyer/",
    "/slip-and-fall-lawyer/",
    "/motorcycle-accident-lawyer/",
    "/wrongful-death-lawyer/",
)
CITY_PAGES = ("westlake-village", "oak-park", "agoura-hills", "newbury-park", "camarillo", "simi-valley")
# Status elements that assets/city-pages.js replaces with the live form message.
JS_STATUS_IDS = {"form-integration-note", "form-status"}
STALE_FORM_NOTICES = (
    "redesign preview",
    "will be enabled only after a secure form endpoint",
    "будет активирована только после проверки",
)


def sitemap_files():
    xml = (SITE / "sitemap.xml").read_text(encoding="utf-8")
    for path in re.findall(r"<loc>https://thousandoaksinjury\.com([^<]*)</loc>", xml):
        yield path, SITE / (path.lstrip("/") + "index.html")


def read(path):
    return path.read_text(encoding="utf-8")


class MobileContactBarTests(unittest.TestCase):
    def test_every_sitemap_page_shows_number_and_free_consultation(self):
        pages = list(sitemap_files())
        self.assertEqual(len(pages), 15)
        for route, path in pages:
            with self.subTest(route=route):
                html = read(path)
                bars = re.findall(r'<div class="mobile-action-bar"[^>]*>.*?</div>', html)
                self.assertEqual(len(bars), 1)
                bar = bars[0]
                self.assertIn('role="region"', bar)
                self.assertIn(PHONE_HREF, bar)
                self.assertIn(f'<span class="mobile-action-number">{PHONE_TEXT}</span>', bar)
                self.assertRegex(bar, r'href="/?#contact">(Free Consultation|Бесплатная консультация)</a>')

    def test_css_styles_number_and_compacts_mobile_consent_banner(self):
        css = read(SITE / "assets" / "city-pages.css")
        self.assertIn(".mobile-action-number", css)
        self.assertIn(".cookie-banner__actions { display: grid; grid-template-columns: 1fr 1fr;", css)
        self.assertIn("[data-cookie-manage] { grid-column: 1 / -1;", css)


class FormNoticeTests(unittest.TestCase):
    def test_no_stale_form_notices_and_status_is_replaced_by_js(self):
        for path in SITE.glob("**/*.html"):
            html = read(path)
            for stale in STALE_FORM_NOTICES:
                with self.subTest(page=str(path.relative_to(SITE)), stale=stale):
                    self.assertNotIn(stale, html)
            for form in re.findall(r"<form[^>]*>", html):
                described = re.search(r'aria-describedby="([^"]+)"', form)
                with self.subTest(page=str(path.relative_to(SITE)), form=form):
                    self.assertIsNotNone(described)
                    self.assertIn(described.group(1), JS_STATUS_IDS)
                    self.assertIn(f'id="{described.group(1)}"', html)


class InternalLinkTests(unittest.TestCase):
    def test_city_pages_link_every_practice_page(self):
        for city in CITY_PAGES:
            html = read(SITE / city / "index.html")
            for target in PRACTICE_PAGES:
                with self.subTest(city=city, target=target):
                    self.assertIn(f'href="{target}"', html)

    def test_car_accident_page_has_local_section_and_related_links(self):
        html = read(SITE / "car-accident-lawyer" / "index.html")
        self.assertIn('id="thousand-oaks-crashes"', html)
        for target in ("/westlake-village/", "/newbury-park/", "/agoura-hills/", "/oak-park/",
                       "/motorcycle-accident-lawyer/", "/wrongful-death-lawyer/"):
            with self.subTest(target=target):
                self.assertIn(f'href="{target}"', html)
        # Title and H1 are ranking assets and must not change.
        self.assertIn("<title>Thousand Oaks Car Accident Lawyer | Savostyanov Law</title>", html)
        self.assertRegex(html, r"<h1[^>]*>Thousand Oaks Car Accident Lawyer</h1>")

    def test_russian_practice_list_uses_existing_pages(self):
        html = read(SITE / "ru" / "index.html")
        for target in PRACTICE_PAGES:
            with self.subTest(target=target):
                self.assertIn(f'href="{target}" hreflang="en"', html)


class ConsentLocalizationTests(unittest.TestCase):
    def test_consent_ui_has_russian_text_and_same_controls(self):
        js = read(SITE / "assets" / "city-pages.js")
        for token in ("Отклонить все", "Принять все", "Настройки cookie",
                      "data-cookie-reject-all", "data-cookie-accept-all", "data-cookie-manage", "data-cookie-save"):
            with self.subTest(token=token):
                self.assertIn(token, js)
        # Analytics stay opt-in: no change to the consent default.
        self.assertIn("rejectAnalyticsCookies();\n    if (bannerEl) bannerEl.classList.add('show');", js)


if __name__ == "__main__":
    unittest.main()
