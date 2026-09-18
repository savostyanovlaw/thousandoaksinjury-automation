import unittest
from scripts.agent_orchestrator import Artifact, ExecutionDenied, route, execute


class OrchestratorTests(unittest.TestCase):
    def test_routes_and_requires_identity(self):
        a = route("video-engine", {"video-engine": lambda: {
            "artifactId": "a1", "revision": "r1", "publishAllowed": False}})
        self.assertEqual((a.artifact_id, a.revision), ("a1", "r1"))
        self.assertFalse(a.payload["publishAllowed"])

    def test_pending_and_rejected_cannot_execute(self):
        a = Artifact("a1", "r1", "x", {})
        for status in ("PENDING", "REJECTED"):
            with self.assertRaises(ExecutionDenied):
                execute(a, {"status": status, "artifactId": "a1", "targetRevision": "r1"}, lambda _: True)

    def test_exact_revision_executes_once(self):
        a = Artifact("a1", "r1", "x", {})
        approval = {"status": "APPROVED", "artifactId": "a1", "targetRevision": "r1", "consumedAt": None}
        self.assertTrue(execute(a, approval, lambda _: True))
        with self.assertRaises(ExecutionDenied):
            execute(a, approval, lambda _: True)

    def test_artifact_mismatch_cannot_execute(self):
        a = Artifact("a1", "r1", "x", {})
        with self.assertRaises(ExecutionDenied):
            execute(a, {"status": "APPROVED", "artifactId": "other", "targetRevision": "r1"}, lambda _: True)

    def test_consumed_approval_cannot_replay(self):
        a = Artifact("a1", "r1", "x", {})
        with self.assertRaises(ExecutionDenied):
            execute(a, {"status": "APPROVED", "artifactId": "a1", "targetRevision": "r1", "consumedAt": "already"}, lambda _: True)

    def test_stale_revision_cannot_execute(self):
        a = Artifact("a1", "r2", "x", {})
        with self.assertRaises(ExecutionDenied):
            execute(a, {"status": "APPROVED", "artifactId": "a1", "targetRevision": "r1"}, lambda _: True)


if __name__ == "__main__":
    unittest.main()
