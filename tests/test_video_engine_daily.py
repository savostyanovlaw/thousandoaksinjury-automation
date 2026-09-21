import base64
import json
import unittest

from scripts import video_engine_daily as daily


def marker_line(package):
    encoded = base64.b64encode(json.dumps(package).encode("utf-8")).decode("utf-8")
    return f"2026-09-21T10:00:00Z SLC_REVIEW_JSON_B64={encoded}"


class ExtractPackageFromLogTests(unittest.TestCase):
    def test_extracts_a_real_package_from_a_realistic_log(self):
        package = {"agent": "video-engine", "topic": "dog bites", "location": "California"}
        log = "some setup output\n" + marker_line(package) + "\nmore output\n"
        self.assertEqual(daily.extract_package_from_log(log), package)

    def test_returns_none_when_no_marker_present(self):
        self.assertIsNone(daily.extract_package_from_log("plain log with no marker"))

    def test_uses_the_last_marker_when_the_step_ran_more_than_once(self):
        first = {"agent": "video-engine", "topic": "old", "location": "California"}
        second = {"agent": "video-engine", "topic": "new", "location": "California"}
        log = marker_line(first) + "\n" + marker_line(second)
        self.assertEqual(daily.extract_package_from_log(log)["topic"], "new")

    def test_malformed_base64_does_not_raise(self):
        self.assertIsNone(daily.extract_package_from_log("SLC_REVIEW_JSON_B64=not-valid-base64!!"))


class HistoryFromRunsTests(unittest.TestCase):
    def test_builds_history_entries_from_real_run_and_log_pairs(self):
        package = {
            "agent": "video-engine",
            "topic": "dog bites",
            "location": "California",
            "geographicScope": "california_wide",
        }
        run = {"id": 1, "created_at": "2026-09-20T10:00:00Z"}
        history = daily.history_from_runs([(run, [marker_line(package)])])
        self.assertEqual(
            history,
            [{"topic": "dog bites", "location": "California", "geographicScope": "california_wide", "createdAt": "2026-09-20T10:00:00Z"}],
        )

    def test_skips_runs_with_no_marker_at_all(self):
        run = {"id": 2, "created_at": "2026-09-20T10:00:00Z"}
        history = daily.history_from_runs([(run, ["no marker here"])])
        self.assertEqual(history, [])

    def test_skips_packages_from_a_different_agent(self):
        package = {"agent": "content-creator", "topic": "x", "location": "California"}
        run = {"id": 3, "created_at": "2026-09-20T10:00:00Z"}
        history = daily.history_from_runs([(run, [marker_line(package)])])
        self.assertEqual(history, [])

    def test_checks_every_job_log_for_the_run_not_just_the_first(self):
        package = {"agent": "video-engine", "topic": "dog bites", "location": "California", "geographicScope": "california_wide"}
        run = {"id": 4, "created_at": "2026-09-20T10:00:00Z"}
        history = daily.history_from_runs([(run, ["no marker in this job's log", marker_line(package)])])
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["topic"], "dog bites")

    def test_results_are_sorted_oldest_first(self):
        older = {"agent": "video-engine", "topic": "a", "location": "California"}
        newer = {"agent": "video-engine", "topic": "b", "location": "California"}
        runs = [
            ({"id": 1, "created_at": "2026-09-21T10:00:00Z"}, [marker_line(newer)]),
            ({"id": 2, "created_at": "2026-09-19T10:00:00Z"}, [marker_line(older)]),
        ]
        history = daily.history_from_runs(runs)
        self.assertEqual([e["topic"] for e in history], ["a", "b"])


class LoadOpportunityFindingsTests(unittest.TestCase):
    def test_missing_path_returns_empty_list(self):
        self.assertEqual(daily.load_opportunity_findings(""), [])
        self.assertEqual(daily.load_opportunity_findings("/no/such/file.json"), [])

    def test_reads_real_findings_from_a_report_file(self):
        import tempfile, os
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "report.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"findings": [{"type": "thin_content", "url": "https://x/"}]}, handle)
            self.assertEqual(daily.load_opportunity_findings(path), [{"type": "thin_content", "url": "https://x/"}])


if __name__ == "__main__":
    unittest.main()
