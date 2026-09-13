import pathlib
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


if __name__ == '__main__':
    unittest.main()
