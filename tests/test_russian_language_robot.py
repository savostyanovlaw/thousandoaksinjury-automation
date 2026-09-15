import unittest
from scripts import russian_language_robot as agent

class RussianLanguageRobotTests(unittest.TestCase):
    def test_audit_accepts_complete_russian_page(self):
        html='''<html lang="ru"><head><title>Адвокат по травмам в Калифорнии | Savostyanov Law</title><meta name="description" content="Русскоязычный адвокат по делам о травмах в Калифорнии. Персональная консультация и помощь после ДТП."><link rel="canonical" href="https://thousandoaksinjury.com/ru/"></head><body><h1>Русскоязычный адвокат по травмам</h1><a href="tel:+18182138798">Позвонить</a><a href="mailto:attorney@savostyanovlaw.com">Email</a></body></html>'''
        r=agent.audit_html(html)
        self.assertEqual(r['issues'],[]);self.assertEqual(r['mode'],'READ_ONLY')
    def test_audit_flags_missing_russian_and_contact_signals(self):
        r=agent.audit_html('<html lang="en"><head><title>Lawyer</title></head><body><h1>Lawyer</h1></body></html>')
        self.assertTrue({'wrong_language','missing_russian_copy','missing_meta_description','missing_canonical','missing_phone','missing_email'} <= set(r['issues']))
    def test_agent_never_publishes(self):
        self.assertFalse(agent.audit_html('<html></html>')['publishAllowed'])

if __name__=='__main__': unittest.main()
