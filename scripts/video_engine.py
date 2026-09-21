import re

from scripts.video_topic_bank import REGIONAL_MARKETS

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


def _infer_geographic_scope(location):
    loc = location.strip().lower()
    if loc == "california":
        return "california_wide"
    if any(loc == market.lower() for market in REGIONAL_MARKETS):
        return "regional"
    return "local"


def _location_suffix(topic, location):
    # Several curated California-wide topics already name "California" in
    # their own text (e.g. "California personal injury deadlines"); appending
    # "in California" again would read as an awkward duplication, so this is
    # skipped whenever the location is already named in the topic.
    if location.lower() in topic.lower():
        return ""
    return f" in {location}"


def build_video_package(
    topic,
    location,
    source_id,
    *,
    geographic_scope=None,
    why_today=None,
    data_signal_used=None,
    target_audience=None,
    search_intent=None,
    primary_distribution=None,
    series=None,
    sources=None,
    seo_rationale=None,
    target_page_or_cluster=None,
    expected_role=None,
):
    topic = _validate(topic, "topic")
    location = _validate(location, "location")
    source_id = _validate_id(source_id, "source_id")
    geographic_scope = geographic_scope or _infer_geographic_scope(location)
    location_suffix = _location_suffix(topic, location)
    title = f"{topic.title()}{location_suffix}: What Injury Claimants Should Know"
    hook = f"A {topic.lower()} can raise important questions about evidence, treatment, insurance, and legal deadlines."
    paragraphs = [
        f"If you were involved in a {topic.lower()}{location_suffix}, the useful first step is preserving the facts: photographs, witness information, incident records, insurance communications, and a clear chronology. The value of any claim depends on its specific evidence rather than a generic formula.",
        "Medical documentation can also matter. Follow appropriate medical advice, keep records of treatment and symptoms, and preserve bills and related correspondence. A video should not diagnose an injury or promise a particular legal or financial outcome.",
        "Liability and available insurance can turn on details that are not obvious from the initial incident. Statements about statutes, deadlines, fault, damages, or coverage must therefore be verified against current California authority and the actual facts before publication.",
        "This package is educational draft material for attorney review. It is not legal advice to a particular viewer and it must not be published, uploaded, or used as a representation about a case outcome until the responsible attorney approves the final version.",
    ]
    script = "\n\n".join(paragraphs)
    description = f"Educational overview of {topic.lower()} issues{location_suffix}. Final legal statements and calls to action require attorney review before publication."
    return {
        "agent": "video-engine",
        "mode": "REVIEW_ONLY",
        "sourceId": source_id,
        "topic": topic,
        "location": location,
        "geographicScope": geographic_scope,
        "title": title,
        "hook": hook,
        "script": script,
        "cta": "Contact Savostyanov Law Corporation for a free, no-obligation case review.",
        "description": description,
        "keywords": [topic.lower(), "California personal injury", "injury claim"],
        "requiresAttorneyReview": True,
        "publishAllowed": False,
        "approvalState": "PENDING",
        "reviewNotes": "Attorney review required before any publication or external execution.",
        "whyToday": why_today,
        "dataSignalUsed": data_signal_used,
        "targetAudience": target_audience,
        "searchIntent": search_intent,
        "primaryDistribution": primary_distribution,
        "series": series,
        "sources": sources or [],
        "seoRationale": seo_rationale,
        "legalBarComplianceRisk": (
            "LOW -- general educational content with no case results, guarantees, or outcome "
            "predictions; requires attorney review before any publication."
        ),
        "targetPageOrCluster": target_page_or_cluster,
        "expectedRole": expected_role,
    }
