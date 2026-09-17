import re

_UNSAFE = re.compile(r"<\s*/?\s*(script|iframe|object|embed|style)\b", re.IGNORECASE)


def _validate(value, field, max_length=5000):
    if not isinstance(value, str):
        raise ValueError(f"unsupported {field}")
    value = value.strip()
    if not value or len(value) > max_length or _UNSAFE.search(value):
        raise ValueError(f"unsupported {field}")
    return value


def localize(source_id, source_revision, title, body):
    source_id = _validate(source_id, "source_id", 160)
    source_revision = _validate(source_revision, "source_revision", 160)
    title = _validate(title, "title", 500)
    body = _validate(body, "body")

    # Deterministic review draft: preserve the English source verbatim for the
    # attorney while providing a conservative Russian-language wrapper. The
    # robot intentionally does not invent statutes, deadlines, or case law.
    localized_title = f"Русская версия для проверки: {title}"
    localized_body = (
        "Черновик русскоязычной версии для юридической проверки. "
        "Исходный материал сохранён без добавления новых правовых утверждений.\n\n"
        f"Исходный текст: {body}"
    )

    return {
        "agent": "russian-language-robot",
        "sourceId": source_id,
        "sourceRevision": source_revision,
        "language": "ru",
        "mode": "REVIEW_ONLY",
        "title": localized_title,
        "body": localized_body,
        "requiresAttorneyReview": True,
        "publishAllowed": False,
        "approvalState": "PENDING",
        "reviewNotes": "Требуется проверка адвокатом перед публикацией или внешним исполнением.",
    }
