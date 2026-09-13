import unittest

from scripts.reconcile_watchdog_issues import issue_marker, desired_actions


class ReconcileTests(unittest.TestCase):
    def test_marker_is_stable(self):
        self.assertEqual(
            issue_marker("watchdog:canonical:/"),
            "<!-- technical-seo-watchdog:watchdog:canonical:/ -->",
        )

    def test_new_failure_creates_issue(self):
        actions = desired_actions(
            current_failures=[{"fingerprint": "watchdog:route:/", "evidence": "500"}],
            tracked_issues=[],
        )
        self.assertEqual(actions[0]["action"], "create")

    def test_open_same_failure_does_not_duplicate(self):
        actions = desired_actions(
            current_failures=[{"fingerprint": "watchdog:route:/", "evidence": "500"}],
            tracked_issues=[{"number": 4, "state": "open", "fingerprint": "watchdog:route:/", "last_evidence": "500"}],
        )
        self.assertFalse(any(a["action"] == "create" for a in actions))

    def test_open_changed_evidence_comments(self):
        actions = desired_actions(
            current_failures=[{"fingerprint": "watchdog:route:/", "evidence": "503"}],
            tracked_issues=[{"number": 4, "state": "open", "fingerprint": "watchdog:route:/", "last_evidence": "500"}],
        )
        self.assertEqual(actions, [{"action": "comment", "issue_number": 4, "failure": {"fingerprint": "watchdog:route:/", "evidence": "503"}}])

    def test_recovered_failure_closes_issue(self):
        actions = desired_actions(
            current_failures=[],
            tracked_issues=[{"number": 4, "state": "open", "fingerprint": "watchdog:route:/", "last_evidence": "500"}],
        )
        self.assertEqual(actions, [{"action": "recover", "issue_number": 4}])

    def test_recurring_failure_reopens_same_issue(self):
        failure = {"fingerprint": "watchdog:route:/", "evidence": "500"}
        actions = desired_actions(
            current_failures=[failure],
            tracked_issues=[{"number": 4, "state": "closed", "fingerprint": "watchdog:route:/", "last_evidence": "200"}],
        )
        self.assertEqual(actions[0]["action"], "reopen")
        self.assertEqual(actions[0]["issue_number"], 4)


if __name__ == "__main__":
    unittest.main()
