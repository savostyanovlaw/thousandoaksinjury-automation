import re

_UNSAFE = re.compile(r"<\s*/?\s*(script|iframe|object|embed)\b", re.IGNORECASE)

def _text(value, field, limit=10000):
    if not isinstance(value, str):
        raise ValueError(f"unsupported {field}")
    value = value.strip()
    if not value or len(value) > limit or _UNSAFE.search(value):
        raise ValueError(f"unsupported {field}")
    return value

def _risk(reason):
    r=reason.lower()
    legal=("deadline","statute","damages","liability","legal","law","government claim","recorded statement","comparative fault")
    seo=("title","meta","heading","schema","internal link","keyword","search","seo")
    if any(x in r for x in legal): return "LEGAL_REVIEW"
    if any(x in r for x in seo): return "SEO_REVIEW"
    return "CONTENT_REVIEW"

def refresh(source_id, source_revision, title, body, material_change_reasons, proposed_changes=None, sources=None):
    source_id=_text(source_id,"source_id",160)
    source_revision=_text(source_revision,"source_revision",160)
    title=_text(title,"title",500)
    body=_text(body,"body")
    if not isinstance(material_change_reasons,list):
        raise ValueError("material change reasons must be a list")
    reasons=[_text(x,"material_change_reason",500) for x in material_change_reasons]
    proposed_changes=proposed_changes or []
    sources=sources or []

    # A refresher must never dump the entire source page and call it a draft.
    # A review card is actionable only when it contains a concrete before/after
    # change and source support. Otherwise there is nothing for the owner to approve.
    if not reasons:
        return {
            "agent":"content-refresher","sourceId":source_id,"sourceRevision":source_revision,
            "title":title,"status":"HEALTHY","findings":[],"findingCount":0,
            "recommendedAction":"AUTO_ARCHIVE","requiresAttorneyReview":False,
            "publishAllowed":False,"approvalState":"NOT_REQUIRED","siteMutated":False,
            "summary":"No material refresh finding was identified. No change is proposed."
        }

    normalized=[]
    for i,change in enumerate(proposed_changes):
        if not isinstance(change,dict): continue
        before=str(change.get("before","")).strip()
        after=str(change.get("after","")).strip()
        reason=str(change.get("reason",reasons[min(i,len(reasons)-1)])).strip()
        if before and after and before != after:
            normalized.append({
                "page":source_id,
                "issue":reason,
                "why":reason,
                "risk":_risk(reason),
                "diff":{"before":before,"after":after},
                "sources":[str(x).strip() for x in change.get("sources",sources) if str(x).strip()],
                "afterApproval":"Prepare a revision-bound branch/PR containing only this reviewed change."
            })

    if not normalized:
        return {
            "agent":"content-refresher","sourceId":source_id,"sourceRevision":source_revision,
            "title":title,"status":"NEEDS_RESEARCH","findings":[],"findingCount":0,
            "recommendedAction":"AUTO_ARCHIVE",
            "requiresAttorneyReview":False,"publishAllowed":False,
            "approvalState":"NOT_REQUIRED","siteMutated":False,
            "summary":"A refresh reason exists, but no concrete source-backed before/after change was produced. Nothing is submitted for approval.",
            "researchNeeded":reasons
        }

    return {
        "agent":"content-refresher","sourceId":source_id,"sourceRevision":source_revision,
        "title":title,"status":"REVIEW","findings":normalized,"findingCount":len(normalized),
        "recommendedAction":"Review each source-backed diff. Approval may authorize preparation of a branch/PR only.",
        "mode":"REVIEW_ONLY","requiresAttorneyReview":True,"publishAllowed":False,
        "approvalState":"PENDING","siteMutated":False
    }
