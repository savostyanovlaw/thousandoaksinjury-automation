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

    def test_california_location_infers_california_wide_scope(self):
        package = agent.build_video_package("dog bites", "California", "sched:1")
        self.assertEqual(package["geographicScope"], "california_wide")

    def test_a_local_city_location_infers_local_scope(self):
        package = agent.build_video_package("dog bite", "Thousand Oaks", "sched:2")
        self.assertEqual(package["geographicScope"], "local")

    def test_a_named_regional_market_infers_regional_scope(self):
        package = agent.build_video_package("rideshare accidents", "Los Angeles", "sched:3")
        self.assertEqual(package["geographicScope"], "regional")

    def test_an_explicit_scope_overrides_inference(self):
        package = agent.build_video_package("dog bites", "California", "sched:4", geographic_scope="local")
        self.assertEqual(package["geographicScope"], "local")

    def test_title_does_not_duplicate_a_location_already_named_in_the_topic(self):
        package = agent.build_video_package("California personal injury deadlines", "California", "sched:5")
        self.assertEqual(package["title"].lower().count("california"), 1)

    def test_title_names_the_location_when_not_already_in_the_topic(self):
        package = agent.build_video_package("dog bite", "Thousand Oaks", "sched:6")
        self.assertIn("Thousand Oaks", package["title"])

    def test_rich_proposal_fields_are_carried_through_when_provided(self):
        package = agent.build_video_package(
            "dog bites",
            "California",
            "sched:7",
            why_today="Test reason",
            data_signal_used="Test signal",
            target_audience="Test audience",
            search_intent="Test intent",
            primary_distribution="Multi-channel",
            series="California Injury Claim Myths",
            sources=["Video Engine proposal history"],
            seo_rationale="Test rationale",
            target_page_or_cluster="California personal injury content cluster",
            expected_role="search acquisition",
        )
        self.assertEqual(package["whyToday"], "Test reason")
        self.assertEqual(package["dataSignalUsed"], "Test signal")
        self.assertEqual(package["targetAudience"], "Test audience")
        self.assertEqual(package["searchIntent"], "Test intent")
        self.assertEqual(package["primaryDistribution"], "Multi-channel")
        self.assertEqual(package["series"], "California Injury Claim Myths")
        self.assertEqual(package["sources"], ["Video Engine proposal history"])
        self.assertEqual(package["seoRationale"], "Test rationale")
        self.assertEqual(package["targetPageOrCluster"], "California personal injury content cluster")
        self.assertEqual(package["expectedRole"], "search acquisition")
        self.assertIn("attorney review", package["legalBarComplianceRisk"].lower())

    def test_cta_never_promises_a_specific_outcome(self):
        package = agent.build_video_package("dog bites", "California", "sched:8")
        self.assertNotIn("guarantee", package["cta"].lower())


if __name__ == "__main__":
    unittest.main()
