import unittest
from scripts import content_refresher as agent


class ContentRefresherTests(unittest.TestCase):
    def test_refresh_is_revision_bound_and_review_only(self):
        artifact = agent.refresh("page-101", "rev-4", "Car Accident FAQ", "Existing reviewed content.", ["outdated statistic", "broken internal reference"])
        self.assertEqual(artifact["agent"], "content-refresher")
        self.assertEqual(artifact["sourceId"], "page-101")
        self.assertEqual(artifact["sourceRevision"], "rev-4")
        self.assertEqual(artifact["mode"], "REVIEW_ONLY")
        self.assertTrue(artifact["requiresAttorneyReview"])
        self.assertFalse(artifact["publishAllowed"])
        self.assertEqual(artifact["approvalState"], "PENDING")
        self.assertEqual(len(artifact["materialChangeReasons"]), 2)

    def test_preserves_source_and_does_not_claim_direct_mutation(self):
        artifact = agent.refresh("page-102", "rev-1", "Dog Bite Guide", "Preserve evidence.", ["clarity"])
        self.assertIn("Preserve evidence.", artifact["draftBody"])
        self.assertFalse(artifact["siteMutated"])

    def test_rejects_missing_change_reason(self):
        with self.assertRaises(ValueError):
            agent.refresh("page-103", "rev-2", "Slip and Fall", "Existing content.", [])


if __name__ == "__main__":
    unittest.main()
