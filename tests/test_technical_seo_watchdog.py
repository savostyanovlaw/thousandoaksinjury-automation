import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import technical_seo_watchdog as watchdog
from scripts.technical_seo_watchdog import (
    normalize_path,
    parse_robots,
    parse_sitemap,
    classify_case_review_get,
    make_failure,
)
from scripts.technical_seo_watchdog_runner import inspect_html


class WatchdogCoreTests(unittest.TestCase):
    def test_global_robots_disallow_is_critical(self):
        result = parse_robots("User-agent: *\nDisallow: /\n")
        self.assertTrue(result.global_disallow)

    def test_robots_requires_production_sitemap(self):
        result = parse_robots("User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\n")
        self.assertNotIn("https://thousandoaksinjury.com/sitemap.xml", result.sitemaps)

    def test_sitemap_extracts_production_urls(self):
        xml = """<?xml version='1.0'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'><url><loc>https://thousandoaksinjury.com/</loc></url></urlset>"""
        self.assertEqual(parse_sitemap(xml), ["https://thousandoaksinjury.com/"])

    def test_html_detects_canonical_noindex_and_contacts(self):
        html = """<html><head><link rel='canonical' href='https://thousandoaksinjury.com/'><meta name='robots' content='index,follow'></head><body><a href='tel:+18055551212'>Call</a><a href='mailto:attorney@savostyanovlaw.com'>Email</a></body></html>"""
        result = inspect_html(html)
        self.assertEqual(result.canonicals, ["https://thousandoaksinjury.com/"])
        self.assertFalse(result.noindex)
        self.assertTrue(result.has_tel)
        self.assertTrue(result.has_mailto)

    def test_cloudflare_email_protection_links_are_not_reported_as_broken(self):
        # Cloudflare rewrites mailto: links to /cdn-cgi/l/email-protection#hash
        # at the edge. A direct GET to that path (the URL fragment is never
        # sent to the server) routinely 404s even though the real mailto:
        # link it replaces works fine for visitors, and it is a Cloudflare
        # edge path this repo cannot fix. It must not be reported as a
        # broken internal link.
        sitemap_xml = (
            "<?xml version='1.0'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'>"
            "<url><loc>https://thousandoaksinjury.com/</loc></url></urlset>"
        )
        homepage_html = (
            "<html><head><title>Thousand Oaks Personal Injury Attorney</title></head>"
            "<body>" + "word " * 400 +
            "<a href='tel:+18055551212'>Call</a>"
            "<a href='/cdn-cgi/l/email-protection#abc123'>Email</a>"
            "<a href='/agoura-hills/'>Agoura Hills</a>"
            "<a href='/westlake-village/'>Westlake Village</a>"
            "<a href='/oak-park/'>Oak Park</a>"
            "<a href='/newbury-park/'>Newbury Park</a>"
            "<a href='/camarillo/'>Camarillo</a>"
            "<a href='/simi-valley/'>Simi Valley</a>"
            "</body></html>"
        )
        canonical_html = homepage_html.replace(
            "<head><title>",
            "<head><link rel='canonical' href='https://thousandoaksinjury.com/'><title>",
        )
        responses = {
            "https://thousandoaksinjury.com/": canonical_html,
            "https://thousandoaksinjury.com/robots.txt": "User-agent: *\nDisallow:\nSitemap: https://thousandoaksinjury.com/sitemap.xml\n",
            "https://thousandoaksinjury.com/sitemap.xml": sitemap_xml,
            "https://thousandoaksinjury.com/api/case-review": "",
        }
        for route in ("agoura-hills", "westlake-village", "oak-park", "newbury-park", "camarillo", "simi-valley", "ru"):
            responses[f"https://thousandoaksinjury.com/{route}/"] = "<html><head><title>t</title></head><body>ok</body></html>"

        def fake_fetch(url, timeout=10, retries=1):
            if url == "https://thousandoaksinjury.com/cdn-cgi/l/email-protection":
                return watchdog.FetchResult(url=url, final_url=url, status=404, headers={}, text="")
            text = responses.get(url, "<html><head><title>t</title></head><body>ok</body></html>")
            return watchdog.FetchResult(url=url, final_url=url, status=200, headers={}, text=text)

        with patch.object(watchdog, "fetch_url", side_effect=fake_fetch):
            failures = watchdog.run_checks()
        broken_link_evidence = " ".join(f.evidence for f in failures if f.check == "broken-link")
        self.assertNotIn("cdn-cgi", broken_link_evidence)

    def test_html_extracts_title_description_and_internal_links(self):
        # A full-site crawl (duplicate-title/description detection and
        # broken-internal-link checking in run_checks()) reads
        # info.title / info.meta_description / info.internal_links. These
        # were referenced by run_checks() but never populated by
        # inspect_html(), which crashed the watchdog with an AttributeError
        # on every real production crawl.
        html = (
            "<html><head><title>Thousand Oaks Personal Injury Attorney</title>"
            "<meta name='description' content='Call for a free case review.'>"
            "</head><body><a href='/dog-bite-lawyer/'>Dog Bite</a>"
            "<a href='https://example.com/other'>External</a></body></html>"
        )
        result = inspect_html(html)
        self.assertEqual(result.title, "Thousand Oaks Personal Injury Attorney")
        self.assertEqual(result.meta_description, "Call for a free case review.")
        self.assertIn("/dog-bite-lawyer/", result.internal_links)
        self.assertIn("https://example.com/other", result.internal_links)

    def test_html_accepts_cloudflare_protected_email_link(self):
        html = """<html><body><a href='/cdn-cgi/l/email-protection' class='__cf_email__' data-cfemail='001122'>attorney@example.com</a></body></html>"""
        result = inspect_html(html)
        self.assertTrue(result.has_mailto)

    def test_case_review_get_accepts_non_5xx_response(self):
        self.assertIsNone(classify_case_review_get(200))
        self.assertIsNone(classify_case_review_get(405))
        self.assertIsNotNone(classify_case_review_get(404))
        self.assertIsNotNone(classify_case_review_get(500))

    def test_failure_fingerprint_is_deterministic(self):
        failure = make_failure("canonical", "/westlake-village/", "bad host", "fix canonical")
        self.assertEqual(failure.fingerprint, "watchdog:canonical:/westlake-village/")

    def test_normalize_path_keeps_root_and_adds_trailing_slash(self):
        self.assertEqual(normalize_path("/"), "/")
        self.assertEqual(normalize_path("/oak-park"), "/oak-park/")

    def test_main_exits_zero_with_findings_present(self):
        # A detected finding is the watchdog's expected product, not a
        # runtime defect of the agent itself: main() must exit 0 whenever it
        # successfully produces a report, whether or not that report is
        # healthy. Only a genuine crash (an uncaught exception) should make
        # the process exit non-zero.
        failure = make_failure("robots", "/robots.txt", "evidence", "fix it")
        with tempfile.TemporaryDirectory() as tmp:
            output = str(Path(tmp) / "report.json")
            with patch.object(watchdog, "run_checks", return_value=[failure]):
                with patch("sys.argv", ["technical_seo_watchdog.py", "--output", output]):
                    self.assertEqual(watchdog.main(), 0)
            report = json.loads(Path(output).read_text(encoding="utf-8"))
            self.assertFalse(report["healthy"])
            self.assertEqual(len(report["failures"]), 1)

    def test_main_exits_zero_when_healthy(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = str(Path(tmp) / "report.json")
            with patch.object(watchdog, "run_checks", return_value=[]):
                with patch("sys.argv", ["technical_seo_watchdog.py", "--output", output]):
                    self.assertEqual(watchdog.main(), 0)


if __name__ == "__main__":
    unittest.main()
