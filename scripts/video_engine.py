import re

_SAFE = re.compile(r"^[A-Za-z0-9 .,'&()/+-]{2,120}$")
# source_id is a machine identifier, not display text -- real upstream
# callers pass values like "content-creator:35558638407" (agent id + GitHub
# run id, the same convention used by every other agent's source_id/
# sourceRunId). It never appears in generated title/script/description
# text, so it gets its own, separately-scoped charset instead of widening
# _SAFE (which does appear in generated text) to allow ':'.
_SAFE_ID = re.compile(r"^[A-Za-z0-9 .,'&()/+:_-]{2,160}$")


def _validate(value, field):
    if not isinstance(value, str) or not _SAFE.fullmatch(value.strip()):
        raise ValueError(f"unsupported {field}")
    return value.strip()


def _validate_id(value, field):
    if not isinstance(value, str) or not _SAFE_ID.fullmatch(value.strip()):
        raise ValueError(f"unsupported {field}")
    return value.strip()


def build_video_package(topic, location, source_id):
    topic = _validate(topic, "topic")
    location = _validate(location, "location")
    source_id = _validate_id(source_id, "source_id")
    title = f"{topic.title()} in {location}: What Injury Claimants Should Know"
    hook = f"A {topic.lower()} can raise important questions about evidence, treatment, insurance, and legal deadlines."
    paragraphs = [
        f"If you were involved in a {topic.lower()} in {location}, the useful first step is preserving the facts: photographs, witness information, incident records, insurance communications, and a clear chronology. The value of any claim depends on its specific evidence rather than a generic formula.",
        "Medical documentation can also matter. Follow appropriate medical advice, keep records of treatment and symptoms, and preserve bills and related correspondence. A video should not diagnose an injury or promise a particular legal or financial outcome.",
        "Liability and available insurance can turn on details that are not obvious from the initial incident. Statements about statutes, deadlines, fault, damages, or coverage must therefore be verified against current California authority and the actual facts before publication.",
        "This package is educational draft material for attorney review. It is not legal advice to a particular viewer and it must not be published, uploaded, or used as a representation about a case outcome until the responsible attorney approves the final version.",
    ]
    script = "\n\n".join(paragraphs)
    description = f"Educational overview of {topic.lower()} issues in {location}. Final legal statements and calls to action require attorney review before publication."
    return {
        "agent": "video-engine",
        "mode": "REVIEW_ONLY",
        "sourceId": source_id,
        "topic": topic,
        "location": location,
        "title": title,
        "hook": hook,
        "script": script,
        "description": description,
        "keywords": [topic.lower(), "California personal injury", "injury claim"],
        "requiresAttorneyReview": True,
        "publishAllowed": False,
        "approvalState": "PENDING",
        "reviewNotes": "Attorney review required before any publication or external execution.",
    }
