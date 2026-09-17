import re

_UNSAFE = re.compile(r"<\s*/?\s*(script|iframe|object|embed)\b", re.IGNORECASE)


def _text(value, field, limit=10000):
    if not isinstance(value, str):
        raise ValueError(f"unsupported {field}")
    value = value.strip()
    if not value or len(value) > limit or _UNSAFE.search(value):
        raise ValueError(f"unsupported {field}")
    return value


def refresh(source_id, source_revision, title, body, material_change_reasons):
    source_id = _text(source_id, "source_id", 160)
    source_revision = _text(source_revision, "source_revision", 160)
    title = _text(title, "title", 500)
    body = _text(body, "body")
    if not isinstance(material_change_reasons, list) or not material_change_reasons:
        raise ValueError("material change reason required")
    reasons = [_text(reason, "material_change_reason", 500) for reason in material_change_reasons]

    draft = (
        f"{body}\n\n"
        "[REFRESH REVIEW NOTE] Proposed refresh requires source verification and attorney review "
        "before any legal, factual, deadline, damages, or call-to-action change is published."
    )
    return {
        "agent": "content-refresher",
        "sourceId": source_id,
        "sourceRevision": source_revision,
        "title": title,
        "draftBody": draft,
        "materialChangeReasons": reasons,
        "mode": "REVIEW_ONLY",
        "requiresAttorneyReview": True,
        "publishAllowed": False,
        "approvalState": "PENDING",
        "siteMutated": False,
        "reviewNotes": "Attorney review and source verification required before execution.",
    }
