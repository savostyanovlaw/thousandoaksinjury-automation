from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBSITE = ROOT / "website"

PAGES = {
    "dog-bite-lawyer": "Dog Bite",
    "slip-and-fall-lawyer": "Slip and Fall",
}


def page_html(slug: str) -> str:
    return (WEBSITE / slug / "index.html").read_text(encoding="utf-8")


def test_pi_money_pages_exist():
    for slug in PAGES:
        assert (WEBSITE / slug / "index.html").exists(), f"missing /{slug}/"


def test_pi_money_pages_have_core_seo_and_conversion_signals():
    for slug, topic in PAGES.items():
        html = page_html(slug)
        lower = html.lower()
        canonical = f'https://thousandoaksinjury.com/{slug}/'
        assert canonical in html
        assert html.count("<h1") == 1
        assert topic.lower() in lower
        assert "california" in lower
        assert "application/ld+json" in lower
        assert "tel:+18182138798" in lower
        assert "free case review" in lower


def test_homepage_links_to_all_three_primary_pi_funnels():
    html = (WEBSITE / "index.html").read_text(encoding="utf-8")
    for href in (
        "/car-accident-lawyer/",
        "/dog-bite-lawyer/",
        "/slip-and-fall-lawyer/",
    ):
        assert f'href="{href}"' in html


def test_sitemap_contains_all_three_primary_pi_funnels():
    sitemap = (WEBSITE / "sitemap.xml").read_text(encoding="utf-8")
    for slug in ("car-accident-lawyer", *PAGES.keys()):
        assert f"https://thousandoaksinjury.com/{slug}/" in sitemap
