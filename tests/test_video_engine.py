import unittest
from scripts import video_engine as agent


class VideoEngineTests(unittest.TestCase):
    def test_build_video_package_is_review_only(self):
        package = agent.build_video_package(
            topic="rear-end collision",
            location="California",
            source_id="opportunity-001",
        )
        self.assertEqual(package["agent"], "video-engine")
        self.assertEqual(package["mode"], "REVIEW_ONLY")
        self.assertTrue(package["requiresAttorneyReview"])
        self.assertFalse(package["publishAllowed"])
        self.assertEqual(package["approvalState"], "PENDING")
        self.assertEqual(package["sourceId"], "opportunity-001")

    def test_package_contains_complete_video_review_payload(self):
        package = agent.build_video_package("dog bite", "California", "opportunity-002")
        self.assertTrue(package["title"])
        self.assertTrue(package["hook"])
        self.assertGreaterEqual(len(package["script"]), 300)
        self.assertTrue(package["description"])
        self.assertGreaterEqual(len(package["keywords"]), 3)
        self.assertIn("attorney review", package["reviewNotes"].lower())

    def test_rejects_unsafe_topic_input(self):
        with self.assertRaises(ValueError):
            agent.build_video_package("<script>alert(1)</script>", "California", "opportunity-003")

    def test_never_claims_guaranteed_result(self):
        package = agent.build_video_package("slip and fall", "California", "opportunity-004")
        combined = " ".join(str(v) for v in package.values()).lower()
        self.assertNotIn("guaranteed recovery", combined)
        self.assertNotIn("guaranteed result", combined)

    def test_accepts_the_real_source_id_format_used_by_content_creators_automatic_handoff(self):
        # Confirmed live: Content Creator's real automatic dispatch sends
        # source_id="content-creator:<run_id>" (the same agent-id:run-id
        # convention used across the fleet), and the old strict allowlist
        # regex rejected the colon -- every real automatic Video Engine
        # dispatch failed with "unsupported source_id" until this was fixed.
        package = agent.build_video_package("rideshare accident", "Thousand Oaks", "content-creator:35558638407")
        self.assertEqual(package["sourceId"], "content-creator:35558638407")

    def test_still_rejects_unsafe_source_id_input(self):
        with self.assertRaises(ValueError):
            agent.build_video_package("dog bite", "California", "<script>alert(1)</script>")


if __name__ == "__main__":
    unittest.main()
