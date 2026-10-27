"""Regression checks for slip-and-fall delivery-worker guidance."""
import re
import unittest
from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / "website" / "slip-and-fall-lawyer" / "index.html"


class SlipFallDeliveryLinksTests(unittest.TestCase):
    def test_delivery_guidance_has_contact_and_distinct_internal_link(self):
        html = PAGE.read_text(encoding="utf-8")
        self.assertEqual(html.count("<h2>Falls during deliveries and service calls</h2>"), 1)
        section = html.split("<h2>Falls during deliveries and service calls</h2>", 1)[1].split("</section>", 1)[0]
        self.assertIn('href="/delivery-driver-injury-lawyer/"', section)
        self.assertIn('href="tel:+18182138798"', section)
        self.assertIn("workers’ compensation", section)
        related = html.split("<h2>Related personal injury resources</h2>", 1)[1].split("</section>", 1)[0]
        self.assertNotIn('href="/slip-and-fall-lawyer/"', related)
        self.assertIn('href="/delivery-driver-injury-lawyer/"', related)


if __name__ == "__main__":
    unittest.main()
