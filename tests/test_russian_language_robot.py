import unittest
from scripts import russian_language_robot as agent


class RussianLanguageRobotTests(unittest.TestCase):
    def test_localization_is_source_bound_and_review_only(self):
        artifact = agent.localize(
            source_id="content-001",
            source_revision="rev-7",
            title="What to Do After a California Car Accident",
            body="Preserve evidence and obtain appropriate medical care after an accident.",
        )
        self.assertEqual(artifact["agent"], "russian-language-robot")
        self.assertEqual(artifact["sourceId"], "content-001")
        self.assertEqual(artifact["sourceRevision"], "rev-7")
        self.assertEqual(artifact["language"], "ru")
        self.assertEqual(artifact["mode"], "REVIEW_ONLY")
        self.assertTrue(artifact["requiresAttorneyReview"])
        self.assertFalse(artifact["publishAllowed"])
        self.assertEqual(artifact["approvalState"], "PENDING")

    def test_localization_contains_cyrillic_and_review_warning(self):
        artifact = agent.localize("content-002", "rev-1", "Dog Bite Claim", "Document the incident and preserve evidence.")
        combined = artifact["title"] + artifact["body"]
        self.assertTrue(any("а" <= ch.lower() <= "я" or ch.lower() == "ё" for ch in combined))
        self.assertIn("провер", artifact["reviewNotes"].lower())

    def test_rejects_unsafe_source_text(self):
        with self.assertRaises(ValueError):
            agent.localize("content-003", "rev-1", "<script>alert(1)</script>", "Safe body")


if __name__ == "__main__":
    unittest.main()
