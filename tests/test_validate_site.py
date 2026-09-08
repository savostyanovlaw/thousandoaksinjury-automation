import json
import tempfile
import unittest
from pathlib import Path

from scripts.validate_site import validate_site

ROUTES = {
    "/": "index.html",
    "/car-accident-lawyer/": "car-accident-lawyer/index.html",
    "/agoura-hills/": "agoura-hills/index.html",
    "/camarillo/": "camarillo/index.html",
    "/newbury-park/": "newbury-park/index.html",
    "/oak-park/": "oak-park/index.html",
    "/simi-valley/": "simi-valley/index.html",
    "/westlake-village/": "westlake-village/index.html",
    "/ru/": "ru/index.html",
}


def page(route, extra="", body="ok"):
    return f'''<!doctype html><html><head><link rel="canonical" href="https://thousandoaksinjury.com{route}"><script type="application/ld+json">{json.dumps({"@context":"https://schema.org"})}</script>{extra}</head><body><h1>Heading</h1>{body}</body></html>'''


def build_site(root: Path):
    for route, rel in ROUTES.items():
        p = root / rel; p.parent.mkdir(parents=True, exist_ok=True)
        extra = ''
        if route == "/ru/":
            extra = '<link rel="alternate" hreflang="en" href="https://thousandoaksinjury.com/"><link rel="alternate" hreflang="ru" href="https://thousandoaksinjury.com/ru/">'
        p.write_text(page(route, extra=extra), encoding="utf-8")
    urls = "".join(f"<url><loc>https://thousandoaksinjury.com{r}</loc></url>" for r in ROUTES)
    (root / "sitemap.xml").write_text(f'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>', encoding="utf-8")
    (root / "robots.txt").write_text("User-agent: *\nAllow: /\nSitemap: https://thousandoaksinjury.com/sitemap.xml\n", encoding="utf-8")


class ValidateSiteTests(unittest.TestCase):
    def run_case(self, mutator):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); build_site(root); mutator(root); return validate_site(root)

    def test_clean_fixture_passes(self):
        self.assertEqual(self.run_case(lambda root: None), [])

    def test_missing_canonical(self):
        def mutate(root): (root / "index.html").write_text('<html><body><h1>x</h1></body></html>', encoding="utf-8")
        self.assertTrue(any("missing canonical" in e for e in self.run_case(mutate)))

    def test_duplicate_h1(self):
        def mutate(root): (root / "index.html").write_text(page("/", body="<h1>two</h1>"), encoding="utf-8")
        self.assertTrue(any("expected exactly 1 H1" in e for e in self.run_case(mutate)))

    def test_malformed_jsonld(self):
        def mutate(root): (root / "index.html").write_text('<html><head><link rel="canonical" href="https://thousandoaksinjury.com/"><script type="application/ld+json">{bad}</script></head><body><h1>x</h1></body></html>', encoding="utf-8")
        self.assertTrue(any("malformed JSON-LD" in e for e in self.run_case(mutate)))

    def test_unresolved_internal_link(self):
        def mutate(root): (root / "index.html").write_text(page("/", body='<a href="/missing/">bad</a>'), encoding="utf-8")
        self.assertTrue(any("unresolved internal link" in e for e in self.run_case(mutate)))

    def test_unexpected_noindex(self):
        def mutate(root): (root / "index.html").write_text(page("/", extra='<meta name="robots" content="noindex,follow">'), encoding="utf-8")
        self.assertTrue(any("unexpected noindex" in e for e in self.run_case(mutate)))

    def test_missing_sitemap_url(self):
        def mutate(root):
            (root / "sitemap.xml").write_text('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', encoding="utf-8")
        self.assertTrue(any("sitemap missing required URL" in e for e in self.run_case(mutate)))

    def test_banned_copy(self):
        def mutate(root): (root / "index.html").write_text(page("/", body="No Fee Unless We Win"), encoding="utf-8")
        self.assertTrue(any("banned launch copy" in e for e in self.run_case(mutate)))

    def test_russian_page_requires_bilingual_hreflang(self):
        def mutate(root):
            (root / "ru/index.html").write_text(page("/ru/"), encoding="utf-8")
        self.assertTrue(any("Russian page missing hreflang" in e for e in self.run_case(mutate)))

    def test_russian_page_flags_known_untranslated_copy(self):
        def mutate(root):
            html = page("/ru/", extra='<link rel="alternate" hreflang="en" href="https://thousandoaksinjury.com/"><link rel="alternate" hreflang="ru" href="https://thousandoaksinjury.com/ru/">', body="Call or text attorney Alexey Savostyanov directly.")
            (root / "ru/index.html").write_text(html, encoding="utf-8")
        self.assertTrue(any("Russian page contains untranslated English copy" in e for e in self.run_case(mutate)))


if __name__ == "__main__":
    unittest.main()
