import unittest
from scripts import russian_language_robot as agent

class RussianLanguageRobotTests(unittest.TestCase):
    def test_english_wrapper_is_not_reviewable_localization(self):
        a=agent.localize("content-1","rev-1","Car Accident","Preserve evidence.")
        self.assertEqual(a["status"],"NEEDS_LOCALIZATION")
        self.assertEqual(a["approvalState"],"NOT_REQUIRED")
        self.assertFalse(a["requiresAttorneyReview"])

    def test_real_russian_localization_is_source_revision_bound(self):
        a=agent.localize("content-2","rev-7","What to Do After an Accident","Preserve evidence.",
          "Что делать после ДТП в Калифорнии",
          "Сохраните фотографии, сведения о свидетелях и страховую переписку. Этот материал носит общий информационный характер.")
        self.assertEqual(a["status"],"READY_FOR_REVIEW")
        self.assertEqual(a["sourceRevision"],"rev-7")
        self.assertEqual(a["approvalState"],"PENDING")
        self.assertNotIn("Preserve evidence.",a["localizedBody"])

    def test_zero_qa_issues_can_still_require_review_when_new_translation_exists(self):
        a=agent.localize("content-3","rev-2","Dog Bite","Evidence.",
          "Укус собаки в Калифорнии",
          "Сохраните доступные доказательства происшествия и документы, относящиеся к травме.",qa_issues=[])
        self.assertEqual(a["qaIssueCount"],0)
        self.assertEqual(a["translationStatus"],"READY_FOR_REVIEW")
        self.assertTrue(a["requiresAttorneyReview"])

    def test_change_request_creates_explicit_revision_metadata(self):
        a=agent.localize("content-4","rev-3","FAQ","Evidence.",
          "Вопросы после ДТП","Новая русская версия материала для проверки адвокатом.",
          change_request="Сделать язык естественнее.",revision=2)
        self.assertEqual(a["localizationRevision"],2)
        self.assertIn("естественнее",a["changeRequest"])

    def test_rejects_unsafe_source(self):
        with self.assertRaises(ValueError):
            agent.localize("x","r","<script>x</script>","Safe")

if __name__=="__main__": unittest.main()
