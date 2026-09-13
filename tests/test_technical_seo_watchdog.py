import unittest

from scripts.technical_seo_watchdog import (
    normalize_path,
    parse_robots,
    parse_sitemap,
    inspect_html,
    classify_case_review_get,
    make_failure,
)


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


if __name__ == "__main__":
    unittest.main()
