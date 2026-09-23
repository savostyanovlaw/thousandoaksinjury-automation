import json
import unittest

from scripts import translate_content as agent


def anthropic_payload(text):
    return {"content": [{"type": "text", "text": text}]}


class TranslateToRussianTests(unittest.TestCase):
    def test_missing_api_key_returns_none_without_calling_http(self):
        called = []

        def http_post(*args, **kwargs):
            called.append((args, kwargs))
            raise AssertionError("http_post must not be called without an api key")

        title, body = agent.translate_to_russian("Title", "Body", "", http_post=http_post)
        self.assertIsNone(title)
        self.assertIsNone(body)
        self.assertEqual(called, [])

    def test_real_translation_response_is_parsed(self):
        response = anthropic_payload(json.dumps({"title": "Вопросы после ДТП", "body": "Существующий русский текст."}))

        def http_post(url, request_body, api_key):
            self.assertEqual(url, agent.ANTHROPIC_MESSAGES_URL)
            self.assertEqual(api_key, "sk-ant-test")
            self.assertEqual(request_body["model"], agent.TRANSLATION_MODEL)
            self.assertIn("TITLE: FAQ", request_body["messages"][0]["content"])
            return response

        title, body = agent.translate_to_russian("FAQ", "Evidence matters.", "sk-ant-test", http_post=http_post)
        self.assertEqual(title, "Вопросы после ДТП")
        self.assertEqual(body, "Существующий русский текст.")

    def test_markdown_fenced_json_is_still_parsed(self):
        fenced = "```json\n" + json.dumps({"title": "Заголовок", "body": "Текст."}) + "\n```"
        response = anthropic_payload(fenced)
        title, body = agent.translate_to_russian(
            "T", "B", "sk-ant-test", http_post=lambda *a, **k: response
        )
        self.assertEqual(title, "Заголовок")
        self.assertEqual(body, "Текст.")

    def test_malformed_json_response_raises_rather_than_returning_a_partial_draft(self):
        response = anthropic_payload("not json at all")
        with self.assertRaises(json.JSONDecodeError):
            agent.translate_to_russian("T", "B", "sk-ant-test", http_post=lambda *a, **k: response)

    def test_response_missing_title_or_body_raises(self):
        response = anthropic_payload(json.dumps({"title": "", "body": "Текст."}))
        with self.assertRaises(ValueError):
            agent.translate_to_russian("T", "B", "sk-ant-test", http_post=lambda *a, **k: response)

    def test_network_failure_propagates_rather_than_being_swallowed_here(self):
        def http_post(*args, **kwargs):
            raise OSError("network unreachable")

        with self.assertRaises(OSError):
            agent.translate_to_russian("T", "B", "sk-ant-test", http_post=http_post)


class BuildTranslationRequestTests(unittest.TestCase):
    def test_request_includes_the_system_prompt_and_both_fields(self):
        request = agent.build_translation_request("Title here", "Body here")
        self.assertEqual(request["system"], agent.TRANSLATION_SYSTEM_PROMPT)
        self.assertIn("Title here", request["messages"][0]["content"])
        self.assertIn("Body here", request["messages"][0]["content"])


if __name__ == "__main__":
    unittest.main()
