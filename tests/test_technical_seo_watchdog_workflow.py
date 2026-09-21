import pathlib
import subprocess
import sys
import unittest


class WorkflowTests(unittest.TestCase):
    def test_workflow_has_required_triggers_permissions_and_steps(self):
        workflow_path = pathlib.Path('.github/workflows/technical-seo-watchdog.yml')
        self.assertTrue(workflow_path.exists())
        workflow = workflow_path.read_text(encoding='utf-8')
        self.assertIn('push:', workflow)
        self.assertIn('- main', workflow)
        self.assertIn('schedule:', workflow)
        self.assertIn("0 */12 * * *", workflow)
        self.assertIn('workflow_dispatch:', workflow)
        self.assertIn('issues: write', workflow)
        self.assertIn('contents: read', workflow)
        self.assertIn('technical_seo_watchdog_runner.py', workflow)
        self.assertIn('reconcile_watchdog_issues.py', workflow)
        self.assertIn('if: always()', workflow)

    def test_workflow_only_fails_on_missing_report_not_on_findings(self):
        # A production SEO/content finding is the watchdog's normal, intended
        # output (tracked via GitHub issues and the Control Center Review
        # Queue). It must never turn the workflow run itself red, or fleet
        # health monitoring (agent-orchestrator, the Control Center) cannot
        # tell "the watchdog found something" apart from "the watchdog is
        # broken."
        workflow = pathlib.Path('.github/workflows/technical-seo-watchdog.yml').read_text(encoding='utf-8')
        self.assertNotIn("steps.check.outcome == 'failure'", workflow)
        self.assertIn('if [ ! -f artifacts/technical-seo-watchdog/report.json ]; then', workflow)

    def test_watchdog_runner_can_execute_as_script(self):
        result = subprocess.run(
            [sys.executable, 'scripts/technical_seo_watchdog_runner.py', '--help'],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Check live Thousand Oaks Injury technical SEO health.', result.stdout)


if __name__ == '__main__':
    unittest.main()
