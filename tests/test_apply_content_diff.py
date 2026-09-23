import unittest
from scripts import apply_content_diff as agent


class ResolvePagePathTests(unittest.TestCase):
    def test_full_url_maps_to_slug_index_html(self):
        self.assertEqual(
            agent.resolve_page_path("https://thousandoaksinjury.com/dog-bite-lawyer/"),
            "website/dog-bite-lawyer/index.html",
        )

    def test_bare_root_maps_to_index_html(self):
        self.assertEqual(agent.resolve_page_path("https://thousandoaksinjury.com/"), "website/index.html")

    def test_www_host_is_accepted(self):
        self.assertEqual(
            agent.resolve_page_path("https://www.thousandoaksinjury.com/ru/"),
            "website/ru/index.html",
        )

    def test_bare_path_without_scheme_is_accepted(self):
        self.assertEqual(agent.resolve_page_path("/car-accident-lawyer/"), "website/car-accident-lawyer/index.html")

    def test_unexpected_host_is_rejected(self):
        with self.assertRaises(ValueError):
            agent.resolve_page_path("https://evil.example.com/dog-bite-lawyer/")

    def test_path_traversal_is_rejected(self):
        with self.assertRaises(ValueError):
            agent.resolve_page_path("https://thousandoaksinjury.com/../../etc/passwd")

    def test_empty_url_is_rejected(self):
        with self.assertRaises(ValueError):
            agent.resolve_page_path(None)
        with self.assertRaises(ValueError):
            agent.resolve_page_path("")


class ApplyDiffTests(unittest.TestCase):
    def test_replaces_the_single_exact_match(self):
        content = "<p>Old sentence.</p><p>Other text.</p>"
        result = agent.apply_diff(content, "Old sentence.", "New sentence.")
        self.assertEqual(result, "<p>New sentence.</p><p>Other text.</p>")

    def test_refuses_when_before_text_is_not_found(self):
        content = "<p>Something else entirely.</p>"
        with self.assertRaises(ValueError):
            agent.apply_diff(content, "Old sentence.", "New sentence.")

    def test_refuses_an_ambiguous_multiple_match(self):
        content = "<p>Repeat.</p><div>Repeat.</div>"
        with self.assertRaises(ValueError):
            agent.apply_diff(content, "Repeat.", "Changed.")

    def test_refuses_identical_before_and_after(self):
        content = "<p>Same.</p>"
        with self.assertRaises(ValueError):
            agent.apply_diff(content, "Same.", "Same.")

    def test_refuses_empty_before_or_after(self):
        with self.assertRaises(ValueError):
            agent.apply_diff("<p>x</p>", "", "y")
        with self.assertRaises(ValueError):
            agent.apply_diff("<p>x</p>", "x", "")


if __name__ == "__main__":
    unittest.main()
