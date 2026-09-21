import unittest

from scripts import video_topic_bank as bank


class VideoTopicBankTests(unittest.TestCase):
    def test_california_wide_bank_has_no_duplicate_topics(self):
        topics = [t["topic"].strip().lower() for t in bank.CALIFORNIA_WIDE_TOPICS]
        self.assertEqual(len(topics), len(set(topics)))

    def test_california_wide_bank_is_substantial(self):
        # A single-digit bank would force early repetition; the strategy
        # calls for a genuinely diversified rolling portfolio.
        self.assertGreaterEqual(len(bank.CALIFORNIA_WIDE_TOPICS), 20)

    def test_every_california_wide_entry_has_required_fields(self):
        for entry in bank.CALIFORNIA_WIDE_TOPICS:
            for field in ("topic", "search_intent", "target_audience", "expected_role"):
                self.assertIn(field, entry)
                self.assertTrue(entry[field], f"{field} missing for {entry.get('topic')!r}")

    def test_target_mix_bands_are_well_formed_and_do_not_overlap_into_impossibility(self):
        total_low = sum(low for low, high in bank.TARGET_MIX.values())
        total_high = sum(high for low, high in bank.TARGET_MIX.values())
        self.assertLessEqual(total_low, 1.0)
        self.assertGreaterEqual(total_high, 1.0)
        for low, high in bank.TARGET_MIX.values():
            self.assertLess(low, high)

    def test_local_markets_mirror_the_real_site_directory_layout(self):
        # These are the actual website/<slug>/ directories this repository
        # ships, not an independently maintained list that could drift.
        import pathlib
        site_root = pathlib.Path(__file__).resolve().parents[1] / "website"
        for slug in bank.LOCAL_MARKETS:
            if slug == "thousand-oaks":
                continue  # the firm's home base -- lives at website/ root, not its own slug directory
            self.assertTrue((site_root / slug).is_dir(), f"website/{slug}/ does not exist")

    def test_regional_markets_are_distinct_from_local_markets(self):
        local_names = {name.lower() for name in bank.LOCAL_MARKETS.values()}
        regional_names = {name.lower() for name in bank.REGIONAL_MARKETS}
        self.assertEqual(local_names & regional_names, set())


if __name__ == "__main__":
    unittest.main()
