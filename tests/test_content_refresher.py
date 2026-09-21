import unittest
from scripts import content_refresher as agent

class ContentRefresherTests(unittest.TestCase):
    def test_zero_findings_auto_archives(self):
        a=agent.refresh("page-1","rev-1","Title","Existing body.",[])
        self.assertEqual(a["status"],"HEALTHY")
        self.assertEqual(a["findingCount"],0)
        self.assertEqual(a["recommendedAction"],"AUTO_ARCHIVE")
        self.assertEqual(a["approvalState"],"NOT_REQUIRED")

    def test_reason_without_concrete_diff_is_not_sent_for_approval(self):
        a=agent.refresh("page-2","rev-2","Title","Existing body.",["outdated statistic"])
        self.assertEqual(a["status"],"NEEDS_RESEARCH")
        self.assertEqual(a["findingCount"],0)
        self.assertEqual(a["approvalState"],"NOT_REQUIRED")
        self.assertNotIn("draftBody",a)

    def test_actionable_review_contains_page_diff_reason_sources_risk_and_effect(self):
        a=agent.refresh("page-3","rev-3","FAQ","Old sentence.",["deadline language needs verification"],[
            {"before":"Old sentence.","after":"Verified replacement.","reason":"deadline language needs verification","sources":["https://example.invalid/source"]}
        ])
        self.assertEqual(a["status"],"REVIEW")
        self.assertEqual(a["findingCount"],1)
        f=a["findings"][0]
        self.assertEqual(f["page"],"page-3")
        self.assertEqual(f["diff"]["before"],"Old sentence.")
        self.assertEqual(f["diff"]["after"],"Verified replacement.")
        self.assertEqual(f["risk"],"LEGAL_REVIEW")
        self.assertEqual(len(f["sources"]),1)
        self.assertIn("branch/PR",f["afterApproval"])

    def test_does_not_dump_full_page_as_proposed_artifact(self):
        body="A very long existing page body that should not be repeated as a fake proposal."
        a=agent.refresh("page-4","rev-4","Title",body,["clarity"])
        self.assertNotIn("draftBody",a)
        self.assertNotIn(body,str(a))

if __name__=="__main__":
    unittest.main()
