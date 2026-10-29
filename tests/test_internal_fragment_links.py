"""Regression: internal fragment links must point to IDs present in HTML pages."""
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

SITE = Path(__file__).resolve().parents[1] / "website"


class LinksAndIds(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if tag == "a" and attrs.get("href"):
            self.hrefs.append(attrs["href"])


def parse_page(path):
    parser = LinksAndIds()
    parser.feed(path.read_text(encoding="utf-8"))
    return parser


def fragment_target(source, href):
    parsed = urlsplit(href)
    # Only local fragments are in scope. External sites own their own anchors.
    if parsed.scheme or parsed.netloc or not parsed.fragment:
        return None
    if not parsed.path:
        target = source
    elif parsed.path.startswith("/"):
        target = SITE / parsed.path.lstrip("/")
    else:
        target = source.parent / parsed.path
    if target.is_dir() or parsed.path.endswith("/") or not target.suffix:
        target = target / "index.html"
    return target, unquote(parsed.fragment)


class InternalFragmentLinkTests(unittest.TestCase):
    def test_every_local_fragment_resolves_to_an_existing_id(self):
        for source in SITE.rglob("*.html"):
            page = parse_page(source)
            for href in page.hrefs:
                target = fragment_target(source, href)
                if target is None:
                    continue
                dest, fragment = target
                with self.subTest(page=str(source.relative_to(SITE)), href=href):
                    self.assertTrue(dest.is_file(), f"Fragment target page is missing: {dest}")
                    self.assertIn(fragment, parse_page(dest).ids,
                                  f"Fragment #{fragment} is absent from {dest}")


if __name__ == "__main__":
    unittest.main()
