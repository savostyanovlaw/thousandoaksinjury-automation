import datetime as dt
import unittest

from scripts import video_topic_selector as selector
from scripts.video_topic_bank import CALIFORNIA_WIDE_TOPICS, LOCAL_MARKETS, TARGET_MIX


def entry(topic, location, scope, created_at):
    return {"topic": topic, "location": location, "geographicScope": scope, "createdAt": created_at}


class DailyCapTests(unittest.TestCase):
    def test_no_history_means_nothing_produced_today(self):
        self.assertFalse(selector.already_proposed_today([], now=dt.datetime(2026, 9, 21, 12, tzinfo=dt.timezone.utc)))

    def test_a_proposal_earlier_the_same_pacific_day_blocks_a_second_one(self):
        # 2026-09-21T12:00:00Z is 05:00 Pacific on the same calendar day.
        history = [entry("dog bites", "California", "california_wide", "2026-09-21T10:00:00Z")]
        self.assertTrue(selector.already_proposed_today(history, now=dt.datetime(2026, 9, 21, 12, tzinfo=dt.timezone.utc)))

    def test_a_proposal_from_a_different_pacific_day_does_not_block(self):
        history = [entry("dog bites", "California", "california_wide", "2026-09-20T10:00:00Z")]
        self.assertFalse(selector.already_proposed_today(history, now=dt.datetime(2026, 9, 21, 12, tzinfo=dt.timezone.utc)))

    def test_the_utc_to_pacific_day_boundary_is_handled_correctly(self):
        # 2026-09-22T06:00:00Z is 2026-09-21 23:00 Pacific (PDT, UTC-7) --
        # still September 21st in Los Angeles even though it's the 22nd UTC.
        history = [entry("dog bites", "California", "california_wide", "2026-09-21T23:30:00-07:00")]
        self.assertTrue(selector.already_proposed_today(history, now=dt.datetime(2026, 9, 22, 6, tzinfo=dt.timezone.utc)))

    def test_select_next_topic_refuses_a_second_proposal_the_same_day(self):
        history = [entry("dog bites", "California", "california_wide", "2026-09-21T10:00:00Z")]
        result = selector.select_next_topic(history, now=dt.datetime(2026, 9, 21, 20, tzinfo=dt.timezone.utc))
        self.assertFalse(result["produced"])
        self.assertIn("already", result["reason"].lower())


class MixAndDuplicatePreventionTests(unittest.TestCase):
    def test_empty_history_defaults_to_california_wide(self):
        self.assertEqual(selector.most_underrepresented_scope([]), "california_wide")

    def test_a_history_entirely_local_pushes_the_next_pick_toward_california_wide(self):
        history = [entry("car accident", "Thousand Oaks", "local", f"2026-09-{d:02d}T10:00:00Z") for d in range(1, 11)]
        self.assertEqual(selector.most_underrepresented_scope(history), "california_wide")

    def test_a_history_entirely_california_wide_eventually_favors_local_via_the_full_pipeline(self):
        # most_underrepresented_scope alone may mathematically prefer
        # "regional" here (it has a wider target band than local), but
        # regional has no real supporting signal, so the full selection
        # pipeline (select_next_topic) must still land on local rather than
        # perpetuating california_wide indefinitely.
        history = [
            entry(t["topic"], "California", "california_wide", f"2026-08-{i+1:02d}T10:00:00Z")
            for i, t in enumerate(CALIFORNIA_WIDE_TOPICS)
        ]
        result = selector.select_next_topic(history, now=dt.datetime(2026, 9, 21, tzinfo=dt.timezone.utc))
        self.assertTrue(result["produced"])
        self.assertEqual(result["geographic_scope"], "local")

    def test_select_next_topic_never_repeats_an_exact_topic_location_pair_while_bank_has_unused_entries(self):
        history = []
        now = dt.datetime(2026, 9, 1, 18, tzinfo=dt.timezone.utc)
        seen = set()
        for _ in range(len(CALIFORNIA_WIDE_TOPICS)):
            # Force california_wide selection by pre-seeding a lopsided
            # local-heavy history once, then let the natural mix logic run;
            # instead, directly exercise pick_california_wide_topic to keep
            # this test focused on duplicate prevention within one scope.
            picked = selector.pick_california_wide_topic(history)
            key = (picked["topic"].lower(), "california", "california_wide")
            self.assertNotIn(key, seen)
            seen.add(key)
            history.append(entry(picked["topic"], "California", "california_wide", now.isoformat().replace("+00:00", "Z")))
            now += dt.timedelta(days=1)

    def test_pick_california_wide_topic_rotates_back_once_every_entry_is_used(self):
        now = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
        history = [
            entry(t["topic"], "California", "california_wide", (now + dt.timedelta(days=i)).isoformat().replace("+00:00", "Z"))
            for i, t in enumerate(CALIFORNIA_WIDE_TOPICS)
        ]
        # Every topic has now been used exactly once; the next pick must
        # still return a real bank entry, not raise or return nothing.
        picked = selector.pick_california_wide_topic(history)
        self.assertIn(picked["topic"], {t["topic"] for t in CALIFORNIA_WIDE_TOPICS})

    def test_pick_local_topic_never_repeats_a_city_topic_pair_while_combinations_remain(self):
        history = []
        seen = set()
        max_combos = len(LOCAL_MARKETS) * len(selector.LOCAL_TOPIC_POOL)
        for _ in range(max_combos):
            topic, city = selector.pick_local_topic(history)
            key = (topic.lower(), city.lower())
            self.assertNotIn(key, seen)
            seen.add(key)
            history.append(entry(topic, city, "local", "2026-01-01T00:00:00Z"))


class SignalOverrideTests(unittest.TestCase):
    def test_a_real_opportunity_finding_on_a_local_page_overrides_the_rolling_mix(self):
        findings = [{"type": "thin_content", "url": "https://thousandoaksinjury.com/agoura-hills/"}]
        result = selector.find_signal_override([], findings)
        self.assertIsNotNone(result)
        self.assertEqual(result["geographic_scope"], "local")
        self.assertEqual(result["location"], "Agoura Hills")
        self.assertIn("Opportunity Finder", result["data_signal_used"])

    def test_a_real_opportunity_finding_on_a_practice_area_page_maps_to_california_wide(self):
        findings = [{"type": "missing_title", "url": "https://thousandoaksinjury.com/dog-bite-lawyer/"}]
        result = selector.find_signal_override([], findings)
        self.assertIsNotNone(result)
        self.assertEqual(result["geographic_scope"], "california_wide")
        self.assertEqual(result["topic"], "dog bite")

    def test_a_finding_already_acted_on_does_not_override_again(self):
        findings = [{"type": "missing_title", "url": "https://thousandoaksinjury.com/dog-bite-lawyer/"}]
        history = [entry("dog bite", "California", "california_wide", "2026-09-01T00:00:00Z")]
        self.assertIsNone(selector.find_signal_override(history, findings))

    def test_no_findings_means_no_override(self):
        self.assertIsNone(selector.find_signal_override([], None))
        self.assertIsNone(selector.find_signal_override([], []))

    def test_select_next_topic_prefers_a_real_signal_over_the_rolling_mix(self):
        history = [
            entry(t["topic"], "California", "california_wide", f"2026-08-{i+1:02d}T10:00:00Z")
            for i, t in enumerate(CALIFORNIA_WIDE_TOPICS[:5])
        ]
        findings = [{"type": "thin_content", "url": "https://thousandoaksinjury.com/simi-valley/"}]
        result = selector.select_next_topic(history, opportunity_findings=findings, now=dt.datetime(2026, 9, 21, tzinfo=dt.timezone.utc))
        self.assertTrue(result["produced"])
        self.assertEqual(result["location"], "Simi Valley")
        self.assertIn("Opportunity Finder", result["data_signal_used"])


class RegionalDormancyTests(unittest.TestCase):
    def test_regional_never_fires_without_a_real_signal_even_when_most_underrepresented(self):
        # An all-california_wide, no-local history makes "regional" and
        # "local" both mathematically underrepresented; regional must still
        # never be picked without a real signal naming a specific market.
        history = [
            entry(t["topic"], "California", "california_wide", f"2026-08-{(i % 28) + 1:02d}T10:00:00Z")
            for i, t in enumerate(CALIFORNIA_WIDE_TOPICS)
        ]
        for _ in range(10):
            result = selector.select_next_topic(list(history), now=dt.datetime(2026, 9, 21, tzinfo=dt.timezone.utc))
            self.assertTrue(result["produced"])
            self.assertIn(result["geographic_scope"], ("california_wide", "local"))
            history.append(entry(result["topic"], result["location"], result["geographic_scope"], "2026-09-21T10:00:00Z"))


if __name__ == "__main__":
    unittest.main()
