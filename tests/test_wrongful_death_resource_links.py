"""Keep wrongful-death resources relevant and avoid self-referential practice links."""
import unittest
from pathlib import Path

SITE = Path(__file__).resolve().parents[1] / "website"


class WrongfulDeathResourceTests(unittest.TestCase):
    def test_related_links_are_distinct_and_existing(self):
        html = (SITE / "wrongful-death-lawyer" / "index.html").read_text(encoding="utf-8")
        self.assertEqual(html.count("<h2>When a fatal crash involves a rideshare or delivery vehicle</h2>"), 1)
        self.assertEqual(html.count("<h2>Ask about deadlines promptly</h2>"), 1)
        self.assertNotIn("<h2>Discuss the deadline before waiting for an investigation</h2>", html)
        self.assertIn("<h2>Wrongful death questions</h2>", html)
        related = html.split("<h2>Related personal injury resources</h2>", 1)[1].split("</section>", 1)[0]
        self.assertNotIn('href="/wrongful-death-lawyer/"', related)
        for route in ("/rideshare-accident-lawyer/", "/delivery-driver-injury-lawyer/"):
            with self.subTest(route=route):
                self.assertIn(f'href="{route}"', related)
                self.assertTrue((SITE / route.strip("/") / "index.html").exists())
        self.assertIn('href="tel:+18182138798"', html)
        self.assertIn('action="/api/case-review"', html)

    def test_dog_bite_related_links_do_not_link_to_self(self):
        html = (SITE / "dog-bite-lawyer" / "index.html").read_text(encoding="utf-8")
        related = html.split("<h2>Related personal injury resources</h2>", 1)[1].split("</section>", 1)[0]
        self.assertNotIn('href="/dog-bite-lawyer/"', related)
        self.assertIn('href="/delivery-driver-injury-lawyer/"', related)
        self.assertIn('href="tel:+18182138798"', html)


if __name__ == "__main__":
    unittest.main()
