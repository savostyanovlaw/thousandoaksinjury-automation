import pathlib
import unittest
from datetime import datetime, timedelta, timezone

from scripts.agent_orchestrator_health import EXPECTED_AGENTS, SCHEDULED, EVENT_DRIVEN, evaluate_fleet_health, detect_handoff_gaps, HANDOFF_WINDOW_MINUTES

REPO_ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKFLOWS_DIR = REPO_ROOT / ".github" / "workflows"


def make_run(name, event="schedule", status="completed", conclusion="success", hours_ago=1.0, run_number=1):
    stamp = datetime.now(timezone.utc).timestamp() - hours_ago * 3600
    iso = datetime.fromtimestamp(stamp, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {"name": name, "event": event, "status": status, "conclusion": conclusion,
            "updated_at": iso, "created_at": iso, "run_number": run_number, "html_url": "https://example.invalid"}


class ExpectedAgentsMatchRealWorkflowTriggersTests(unittest.TestCase):
    """The scheduled/event-driven classification must be verified from the
    actual workflow YAML, not just asserted in this module -- otherwise it
    could silently drift the same way the old hardcoded orchestrator did."""

    def test_every_expected_agent_workflow_file_exists(self):
        for name, spec in EXPECTED_AGENTS.items():
            path = WORKFLOWS_DIR / spec["workflow"]
            self.assertTrue(path.exists(), f"{name}: {spec['workflow']} does not exist")

    def test_scheduled_agents_actually_declare_a_schedule_trigger(self):
        for name, spec in EXPECTED_AGENTS.items():
            if spec["trigger"] != SCHEDULED:
                continue
            text = (WORKFLOWS_DIR / spec["workflow"]).read_text()
            self.assertIn("schedule:", text, f"{name} is classified SCHEDULED but {spec['workflow']} has no schedule: trigger")
            self.assertIn("cron:", text, f"{name} is classified SCHEDULED but {spec['workflow']} has no cron:")

    def test_event_driven_agents_declare_no_schedule_trigger(self):
        for name, spec in EXPECTED_AGENTS.items():
            if spec["trigger"] != EVENT_DRIVEN:
                continue
            text = (WORKFLOWS_DIR / spec["workflow"]).read_text()
            self.assertNotIn("schedule:", text, f"{name} is classified EVENT_DRIVEN but {spec['workflow']} has a schedule: trigger -- it is actually scheduled")


class EvaluateFleetHealthTests(unittest.TestCase):
    def _all_scheduled_healthy_run(self):
        return [make_run(name) for name, spec in EXPECTED_AGENTS.items() if spec["trigger"] == SCHEDULED]

    def test_healthy_when_every_scheduled_agent_has_a_recent_successful_run_and_no_event_driven_agent_has_ever_run(self):
        report = evaluate_fleet_health(self._all_scheduled_healthy_run())
        self.assertTrue(report["healthy"], report["findings"])
        self.assertEqual(report["checkedAgents"], len(EXPECTED_AGENTS))

    def test_scheduled_agent_missing_is_a_finding(self):
        runs = [r for r in self._all_scheduled_healthy_run() if r["name"] != "Opportunity Finder"]
        report = evaluate_fleet_health(runs)
        self.assertFalse(report["healthy"])
        self.assertTrue(any(f["findingType"] == "agent_missing" and "Opportunity Finder" in f["title"] for f in report["findings"]))

    def test_event_driven_agent_with_no_run_ever_is_not_a_finding(self):
        # No Content Refresher / Video Engine / Content Creator / Russian
        # Language Robot run at all -- this is the real, common steady state
        # for an agent legitimately waiting on an upstream event, and must
        # never be reported as agent_missing.
        report = evaluate_fleet_health(self._all_scheduled_healthy_run())
        titles = " ".join(f["title"] for f in report["findings"])
        for name, spec in EXPECTED_AGENTS.items():
            if spec["trigger"] == EVENT_DRIVEN:
                self.assertNotIn(name, titles)

    def test_scheduled_agent_stale_is_a_finding(self):
        runs = [r for r in self._all_scheduled_healthy_run() if r["name"] != "Technical SEO Watchdog"]
        runs.append(make_run("Technical SEO Watchdog", hours_ago=100))
        report = evaluate_fleet_health(runs)
        self.assertTrue(any(f["findingType"] == "agent_stale" for f in report["findings"]))

    def test_event_driven_agent_that_ran_long_ago_is_not_stale(self):
        runs = self._all_scheduled_healthy_run()
        runs.append(make_run("Video Engine", hours_ago=100000))
        report = evaluate_fleet_health(runs)
        self.assertFalse(any(f["findingType"] == "agent_stale" and "Video Engine" in f["title"] for f in report["findings"]))

    def test_failed_run_is_a_finding_even_for_an_event_driven_agent(self):
        runs = self._all_scheduled_healthy_run()
        runs.append(make_run("Video Engine", conclusion="failure"))
        report = evaluate_fleet_health(runs)
        self.assertFalse(report["healthy"])
        self.assertTrue(any(f["findingType"] == "agent_failed" and "Video Engine" in f["title"] for f in report["findings"]))


class DetectHandoffGapsTests(unittest.TestCase):
    def _upstream_run(self, minutes_ago):
        return make_run("Content Creator", status="completed", conclusion="success", hours_ago=minutes_ago / 60, run_number=1)

    def test_missing_downstream_dispatch_after_window_elapses_is_a_finding(self):
        runs = [self._upstream_run(minutes_ago=HANDOFF_WINDOW_MINUTES + 5)]
        findings = detect_handoff_gaps(runs)
        titles = " ".join(f["title"] for f in findings)
        self.assertIn("Russian Language Robot", titles)
        self.assertIn("Video Engine", titles)

    def test_downstream_dispatch_within_window_is_not_a_finding(self):
        runs = [
            self._upstream_run(minutes_ago=HANDOFF_WINDOW_MINUTES + 5),
            make_run("Russian Language Robot", status="completed", conclusion="success", hours_ago=(HANDOFF_WINDOW_MINUTES - 2) / 60),
            make_run("Video Engine", status="completed", conclusion="success", hours_ago=(HANDOFF_WINDOW_MINUTES - 1) / 60),
        ]
        findings = detect_handoff_gaps(runs)
        self.assertEqual(findings, [])

    def test_a_downstream_run_that_failed_after_dispatch_is_not_reported_here_as_missing(self):
        # A dispatched-but-failed downstream run is a real problem, but it
        # is caught by the ordinary per-agent agent_failed check, not
        # double-reported here as a missing handoff.
        runs = [
            self._upstream_run(minutes_ago=HANDOFF_WINDOW_MINUTES + 5),
            make_run("Russian Language Robot", status="completed", conclusion="failure", hours_ago=(HANDOFF_WINDOW_MINUTES - 2) / 60),
            make_run("Video Engine", status="completed", conclusion="success", hours_ago=(HANDOFF_WINDOW_MINUTES - 1) / 60),
        ]
        findings = detect_handoff_gaps(runs)
        self.assertEqual(findings, [])

    def test_too_soon_after_upstream_success_is_not_yet_a_finding(self):
        runs = [self._upstream_run(minutes_ago=2)]
        findings = detect_handoff_gaps(runs)
        self.assertEqual(findings, [])

    def test_no_recent_successful_upstream_run_produces_no_findings(self):
        findings = detect_handoff_gaps([])
        self.assertEqual(findings, [])

    def test_evaluate_fleet_health_surfaces_handoff_gaps_too(self):
        runs = [self._upstream_run(minutes_ago=HANDOFF_WINDOW_MINUTES + 5)]
        report = evaluate_fleet_health(runs)
        self.assertFalse(report["healthy"])
        self.assertTrue(any(f["findingType"] == "handoff_missing" for f in report["findings"]))


if __name__ == "__main__":
    unittest.main()
