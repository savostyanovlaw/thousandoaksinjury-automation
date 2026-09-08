#!/usr/bin/env python3
import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

REQUIRED_PAGES = {
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

BANNED_COPY = (
    "4.9/5",
    "millions recovered",
    "success rate",
    "no fee unless we win",
    "call or text anytime",
)

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.h1_count = 0
        self.canonical = None
        self.noindex = False
        self.hrefs = []
        self.jsonld = []
        self.hreflangs = {}
        self._jsonld = False
        self._jsonbuf = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "h1": self.h1_count += 1
        if tag == "link" and a.get("rel") == "canonical": self.canonical = a.get("href")
        if tag == "link" and a.get("rel") == "alternate" and a.get("hreflang") and a.get("href"):
            self.hreflangs[a["hreflang"].lower()] = a["href"]
        if tag == "meta" and a.get("name", "").lower() == "robots" and "noindex" in a.get("content", "").lower(): self.noindex = True
        if tag == "a" and a.get("href"): self.hrefs.append(a["href"])
        if tag == "script" and a.get("type") == "application/ld+json": self._jsonld = True; self._jsonbuf = []
    def handle_endtag(self, tag):
        if tag == "script" and self._jsonld:
            self.jsonld.append("".join(self._jsonbuf).strip()); self._jsonld = False; self._jsonbuf = []
    def handle_data(self, data):
        if self._jsonld: self._jsonbuf.append(data)

def _parse(path: Path):
    p = PageParser(); p.feed(path.read_text(encoding="utf-8")); return p

def _internal_target_exists(root: Path, href: str) -> bool:
    if not href.startswith("/") or href.startswith("//"): return True
    path = urlparse(href).path
    if path == "/": return (root / "index.html").exists()
    rel = path.lstrip("/")
    candidate = root / rel
    if path.endswith("/"): candidate = candidate / "index.html"
    elif candidate.suffix == "": candidate = candidate / "index.html"
    return candidate.exists()

def validate_site(root: Path):
    errors = []
    for route, rel in REQUIRED_PAGES.items():
        page = root / rel
        if not page.exists(): errors.append(f"missing required page: {route} -> {rel}"); continue
        text = page.read_text(encoding="utf-8")
        parser = _parse(page)
        if parser.h1_count != 1: errors.append(f"{rel}: expected exactly 1 H1, found {parser.h1_count}")
        if not parser.canonical: errors.append(f"{rel}: missing canonical")
        elif urlparse(parser.canonical).path != route: errors.append(f"{rel}: canonical path mismatch: {parser.canonical}")
        if parser.noindex: errors.append(f"{rel}: unexpected noindex")
        for block in parser.jsonld:
            if block:
                try: json.loads(block)
                except Exception as e: errors.append(f"{rel}: malformed JSON-LD: {e}")
        for href in parser.hrefs:
            if not _internal_target_exists(root, href): errors.append(f"{rel}: unresolved internal link: {href}")
        low = text.lower()
        for banned in BANNED_COPY:
            if banned in low: errors.append(f"{rel}: banned launch copy: {banned}")
        if route == "/ru/":
            if urlparse(parser.hreflangs.get("en", "")).path != "/" or urlparse(parser.hreflangs.get("ru", "")).path != "/ru/":
                errors.append(f"{rel}: Russian page missing hreflang en/ru alternates")
            untranslated = (
                "call or text attorney",
                "free and confidential",
                "not a call center",
                "your thousand oaks attorney",
                "general information, not statistics",
                "common accident locations",
                "do you actually practice in thousand oaks?",
            )
            for phrase in untranslated:
                if phrase in low:
                    errors.append(f"{rel}: Russian page contains untranslated English copy: {phrase}")
    sitemap = root / "sitemap.xml"
    if not sitemap.exists(): errors.append("missing sitemap.xml")
    else:
        try:
            tree = ET.parse(sitemap)
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            urls = {urlparse(n.text or "").path for n in tree.findall(".//sm:loc", ns)}
            for route in REQUIRED_PAGES:
                if route not in urls: errors.append(f"sitemap missing required URL: {route}")
        except Exception as e: errors.append(f"invalid sitemap.xml: {e}")
    robots = root / "robots.txt"
    if not robots.exists(): errors.append("missing robots.txt")
    else:
        if "sitemap:" not in robots.read_text(encoding="utf-8").lower(): errors.append("robots.txt missing Sitemap declaration")
    return errors

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--root", default="website"); args = ap.parse_args()
    errors = validate_site(Path(args.root))
    if errors:
        for e in errors: print(f"ERROR: {e}")
        return 1
    print("Site validation passed")
    return 0

if __name__ == "__main__": sys.exit(main())
