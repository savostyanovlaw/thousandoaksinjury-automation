import json
import urllib.request

ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
TRANSLATION_MODEL = "claude-sonnet-5"

# Never a placeholder or dictionary-substitution translation: this is a real
# call to a real translation-capable model, gated entirely on a real
# ANTHROPIC_API_KEY secret the owner must configure (see translate_to_russian
# -- no key means (None, None), never a fabricated draft). The system prompt
# exists to keep the model from inventing or softening any legal claim while
# translating, not to make it write new content.
TRANSLATION_SYSTEM_PROMPT = (
    "You are a professional legal-content translator for a California personal "
    "injury law firm. Preserve all factual and legal content exactly -- never "
    "add, omit, or invent any claim, guarantee, statistic, or legal statement "
    "that is not already present in the source text. Respond with ONLY a JSON "
    "object, no other text, no markdown code fences."
)


def build_translation_request(title, body, model=TRANSLATION_MODEL):
    prompt = (
        "Translate the following English personal-injury-law web content into "
        "natural, professional Russian for this firm's Russian-speaking clients. "
        'Respond with ONLY a JSON object of the exact form {"title": "<translated '
        'title>", "body": "<translated body>"}.\n\n'
        f"TITLE: {title}\n\nBODY:\n{body}"
    )
    return {
        "model": model,
        "max_tokens": 4096,
        "system": TRANSLATION_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}],
    }


def parse_translation_response(payload):
    """payload is the parsed JSON body of an Anthropic Messages API response.
    Raises ValueError/json.JSONDecodeError on anything that isn't a real,
    complete translation -- the caller (translate_to_russian) never catches
    these itself, so a malformed response is a real, visible failure rather
    than a silently accepted empty/partial draft.
    """
    text = "".join(
        block.get("text", "")
        for block in payload.get("content", [])
        if block.get("type") == "text"
    ).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    data = json.loads(text)
    localized_title = str(data.get("title") or "").strip()
    localized_body = str(data.get("body") or "").strip()
    if not localized_title or not localized_body:
        raise ValueError("translation response was missing a title or body")
    return localized_title, localized_body


def _default_http_post(url, request_body, api_key):
    req = urllib.request.Request(
        url,
        data=json.dumps(request_body).encode("utf-8"),
        method="POST",
        headers={
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


def translate_to_russian(title, body, api_key, http_post=None):
    """Returns (localized_title, localized_body), or (None, None) when
    api_key is not configured -- a genuine, precisely identifiable external
    blocker (see the Russian Language Robot's own NEEDS_LOCALIZATION /
    approvalState=NOT_REQUIRED fallback for that case), never a fabricated
    draft. Raises on a real translation failure (network error, non-2xx
    response, unparseable response); the caller decides how to degrade --
    see content-creator.yml, which catches any exception here and proceeds
    with the Russian-language handoff without a localized draft, which the
    Russian Language Robot already safely auto-archives.
    """
    if not api_key:
        return None, None
    if http_post is None:
        http_post = _default_http_post
    request_body = build_translation_request(title, body)
    payload = http_post(ANTHROPIC_MESSAGES_URL, request_body, api_key)
    return parse_translation_response(payload)
