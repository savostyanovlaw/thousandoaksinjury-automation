import re

_UNSAFE=re.compile(r"<\s*/?\s*(script|iframe|object|embed|style)\b",re.IGNORECASE)
_CYRILLIC=re.compile(r"[А-Яа-яЁё]")

def _validate(value,field,max_length=20000):
    if not isinstance(value,str): raise ValueError(f"unsupported {field}")
    value=value.strip()
    if not value or len(value)>max_length or _UNSAFE.search(value): raise ValueError(f"unsupported {field}")
    return value

def _looks_localized(text):
    letters=[c for c in text if c.isalpha()]
    if not letters: return False
    cyr=sum(1 for c in letters if _CYRILLIC.match(c))
    return cyr/len(letters)>=0.55

def localize(source_id,source_revision,title,body,localized_title=None,localized_body=None,qa_issues=None,change_request=None,revision=1):
    source_id=_validate(source_id,"source_id",160)
    source_revision=_validate(source_revision,"source_revision",160)
    title=_validate(title,"title",500)
    body=_validate(body,"body")
    qa_issues=qa_issues or []
    localized_title=(localized_title or "").strip()
    localized_body=(localized_body or "").strip()

    # Fail closed: the old behavior wrapped the English source in Russian boilerplate.
    # That is not localization and must never become an attorney approval item.
    if not localized_title or not localized_body or not _looks_localized(localized_title+" "+localized_body):
        return {
            "agent":"russian-language-robot","sourceId":source_id,"sourceRevision":source_revision,
            "language":"ru","status":"NEEDS_LOCALIZATION","qaIssues":qa_issues,"qaIssueCount":len(qa_issues),
            "approvalState":"NOT_REQUIRED","requiresAttorneyReview":False,"publishAllowed":False,
            "siteMutated":False,"recommendedAction":"AUTO_ARCHIVE",
            "summary":"Полноценная русская локализация не создана; материал не отправлен адвокату на согласование."
        }

    result={
        "agent":"russian-language-robot","sourceId":source_id,"sourceRevision":source_revision,
        "language":"ru","status":"READY_FOR_REVIEW","translationStatus":"READY_FOR_REVIEW",
        "localizationRevision":int(revision),"sourceTitle":title,"sourceBody":body,
        "localizedTitle":localized_title,
        "localizedBody":localized_body,"qaIssues":qa_issues,"qaIssueCount":len(qa_issues),
        "mode":"REVIEW_ONLY","requiresAttorneyReview":True,"publishAllowed":False,
        "approvalState":"PENDING","siteMutated":False,
        "recommendedAction":"Approve / Request Changes / Reject. Approval may prepare a revision-bound branch/PR only."
    }
    if change_request:
        result["changeRequest"]=_validate(change_request,"change_request",2000)
    return result
