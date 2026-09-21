"""Daily, data-driven topic selection for the Video Engine.

Chooses at most one video topic per America/Los_Angeles calendar day, using
only real signals this repository actually has: Video Engine's own past
output (its proposal history) and other agents' real structural findings
(e.g. Opportunity Finder). It has no access to Search Console, YouTube
Analytics, or any keyword-volume API -- see video_topic_bank's module
docstring for why that is a deliberate, documented gap rather than a
fabricated data source.
"""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import urllib.parse

from scripts.opportunity_finder import CITY_LABELS, PRACTICE_AREA_TOPICS
from scripts.video_topic_bank import (
    CALIFORNIA_WIDE_TOPICS,
    LOCAL_MARKETS,
    TARGET_MIX,
)

PACIFIC = ZoneInfo("America/Los_Angeles")

# Practice areas the site already has a dedicated page for
# (website/car-accident-lawyer/, website/dog-bite-lawyer/,
# website/slip-and-fall-lawyer/), plus the generic city-page topic
# opportunity_finder itself falls back to. Local video topics are drawn from
# this pool so every local proposal has a real internal-linking target.
LOCAL_TOPIC_POOL = ["car accident", "dog bite", "slip and fall accident", "personal injury"]

_SLUG_BY_CITY = {city.lower(): slug for slug, city in LOCAL_MARKETS.items()}


def _parse_iso(value: str) -> dt.datetime:
    return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def pacific_date(moment: dt.datetime) -> dt.date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=dt.timezone.utc)
    return moment.astimezone(PACIFIC).date()


def already_proposed_today(history: list[dict], now: dt.datetime | None = None) -> bool:
    """True if any past proposal's createdAt falls on the same
    America/Los_Angeles calendar day as `now` -- the daily cap applies
    globally, regardless of which trigger (schedule or an event-driven
    handoff) produced the earlier proposal.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    today = pacific_date(now)
    for entry in history:
        created_at = entry.get("createdAt")
        if not created_at:
            continue
        if pacific_date(_parse_iso(created_at)) == today:
            return True
    return False


def _used_pairs(history: list[dict]) -> set[tuple[str, str, str]]:
    pairs = set()
    for entry in history:
        topic = str(entry.get("topic") or "").strip().lower()
        location = str(entry.get("location") or "").strip().lower()
        scope = entry.get("geographicScope") or ""
        if topic:
            pairs.add((topic, location, scope))
    return pairs


def scope_counts(history: list[dict], lookback: int = 30) -> tuple[dict, int]:
    recent = history[-lookback:] if lookback else list(history)
    counts = {scope: 0 for scope in TARGET_MIX}
    for entry in recent:
        scope = entry.get("geographicScope")
        if scope in counts:
            counts[scope] += 1
    return counts, len(recent)


def most_underrepresented_scope(history: list[dict], lookback: int = 30, exclude: set | None = None) -> str:
    """The scope furthest below its target-mix band, by share of recent
    output. Falls back to california_wide (the primary content type) once
    history is empty or every considered scope is already at/above its
    target. `exclude` removes scopes from consideration entirely (used to
    re-rank among the remaining real scopes when the top pick turns out to
    be dormant for lack of real supporting data -- see select_next_topic).
    """
    exclude = exclude or set()
    counts, total = scope_counts(history, lookback=lookback)
    if total == 0:
        return "california_wide"
    deficits = []
    for scope, (low, high) in TARGET_MIX.items():
        if scope in exclude:
            continue
        share = counts[scope] / total
        target_mid = (low + high) / 2
        deficits.append((target_mid - share, scope))
    deficits.sort(reverse=True)
    best_deficit, best_scope = deficits[0]
    return best_scope if best_deficit > 0 else "california_wide"


def topic_for_finding(finding: dict) -> tuple[str | None, str | None, str | None]:
    """Map a real Opportunity Finder finding's URL back to a real
    topic/location/scope, reusing opportunity_finder's own slug tables
    (PRACTICE_AREA_TOPICS, CITY_LABELS) so the two agents never disagree
    about what a given page covers.

    A practice-area page (e.g. /dog-bite-lawyer/) is the site's general,
    statewide authority page for that topic -- opportunity_finder itself
    only defaults it to "Thousand Oaks" because it predates the
    California-wide/regional/local distinction, not because the page is
    hyperlocal in intent. Only a real city-slug page is treated as local.
    """
    url = finding.get("url") or ""
    if not url:
        return None, None, None
    slug = urllib.parse.urlsplit(url).path.strip("/").split("/", 1)[0] if url else ""
    if slug in PRACTICE_AREA_TOPICS:
        return PRACTICE_AREA_TOPICS[slug], "California", "california_wide"
    if slug in CITY_LABELS:
        return "personal injury", CITY_LABELS[slug], "local"
    return "personal injury", "California", "california_wide"


def find_signal_override(history: list[dict], opportunity_findings: list[dict] | None = None) -> dict | None:
    """A real, unresolved structural finding tied to a specific real page
    beats the rolling mix (the "data overrides the target mix" rule),
    grounded in a finding this repository's own agents actually produced
    rather than a fabricated search-volume number.
    """
    if not opportunity_findings:
        return None
    used = _used_pairs(history)
    for finding in opportunity_findings:
        topic, location, scope = topic_for_finding(finding)
        if topic is None:
            continue
        if (topic.lower(), (location or "").lower(), scope) in used:
            continue
        return {
            "topic": topic,
            "geographic_scope": scope,
            "location": location,
            "why_today": (
                f"Opportunity Finder flagged an unresolved '{finding.get('type')}' issue on "
                f"{finding.get('url')} that a supporting video has not yet addressed."
            ),
            "data_signal_used": f"Opportunity Finder finding: {finding.get('type')} on {finding.get('url')}",
            "target_audience": "visitors landing on the flagged page",
            "search_intent": "closing a real, currently-unaddressed content gap",
            "primary_distribution": "Website / Search",
            "series": None,
            "sources": ["Opportunity Finder live-page audit"],
            "seo_rationale": "Directly supports a page with a real, currently-open structural/content finding.",
            "target_page_or_cluster": finding.get("url"),
            "expected_role": "search acquisition",
        }
    return None


def _rotate_least_recent(history: list[dict], candidates: list[tuple[str, str]], scope: str) -> tuple[str, str]:
    last_index = {}
    for i, entry in enumerate(history):
        if entry.get("geographicScope") == scope:
            key = (str(entry.get("topic") or "").strip().lower(), str(entry.get("location") or "").strip().lower())
            last_index[key] = i
    def sort_key(candidate):
        topic, location = candidate
        return last_index.get((topic.lower(), location.lower()), -1)
    return min(candidates, key=sort_key)


def pick_california_wide_topic(history: list[dict]) -> dict:
    used = _used_pairs(history)
    for entry in CALIFORNIA_WIDE_TOPICS:
        if (entry["topic"].lower(), "california", "california_wide") not in used:
            return entry
    topic, _location = _rotate_least_recent(
        history, [(t["topic"], "California") for t in CALIFORNIA_WIDE_TOPICS], "california_wide"
    )
    return next(t for t in CALIFORNIA_WIDE_TOPICS if t["topic"] == topic)


def pick_local_topic(history: list[dict]) -> tuple[str, str]:
    used = _used_pairs(history)
    for city in LOCAL_MARKETS.values():
        for topic in LOCAL_TOPIC_POOL:
            if (topic.lower(), city.lower(), "local") not in used:
                return topic, city
    combos = [(topic, city) for city in LOCAL_MARKETS.values() for topic in LOCAL_TOPIC_POOL]
    return _rotate_least_recent(history, combos, "local")


def select_next_topic(
    history: list[dict],
    opportunity_findings: list[dict] | None = None,
    now: dt.datetime | None = None,
) -> dict:
    """Return the day's single video proposal decision, or
    {"produced": False, "reason": ...} if today's cap is already used.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    if already_proposed_today(history, now):
        return {"produced": False, "reason": "A video proposal was already produced today (America/Los_Angeles)."}

    override = find_signal_override(history, opportunity_findings)
    if override:
        override["produced"] = True
        return override

    scope = most_underrepresented_scope(history)
    if scope == "regional":
        # No agent in this repository currently produces a real,
        # per-market search-opportunity signal for any major California
        # market (confirmed by inspecting every existing agent script), so
        # regional selection stays dormant. Re-rank among the remaining real
        # scopes rather than jumping straight to california_wide -- doing
        # that unconditionally would starve local (which DOES have a real
        # signal: an existing local landing page) every time regional and
        # local are both underrepresented, since regional's wider target
        # band means it out-scores local on raw deficit almost every time.
        scope = most_underrepresented_scope(history, exclude={"regional"})

    if scope == "local":
        topic, city = pick_local_topic(history)
        slug = _SLUG_BY_CITY.get(city.lower(), city.lower().replace(" ", "-"))
        return {
            "produced": True,
            "topic": topic,
            "geographic_scope": "local",
            "location": city,
            "why_today": (
                f"Local content is currently under-represented in the rolling geographic mix, "
                f"and {city} already has a dedicated landing page this video can support."
            ),
            "data_signal_used": "Video Engine's own proposal history (rolling geographic mix) and the site's real local-page inventory",
            "target_audience": f"people searching for a {topic} claim near {city}",
            "search_intent": f"local {topic} legal guidance",
            "primary_distribution": "Website / Local SEO",
            "series": None,
            "sources": ["Video Engine proposal history", "website/ local page inventory"],
            "seo_rationale": f"Supports the existing {city} landing page's topical relevance and internal linking.",
            "target_page_or_cluster": f"website/{slug}/",
            "expected_role": "Local SEO",
        }

    entry = pick_california_wide_topic(history)
    return {
        "produced": True,
        "topic": entry["topic"],
        "geographic_scope": "california_wide",
        "location": "California",
        "why_today": "California-wide personal-injury content is the primary content type and this topic has not been produced recently.",
        "data_signal_used": "Video Engine's own proposal history (rolling geographic mix) and the curated California PI topic bank",
        "target_audience": entry["target_audience"],
        "search_intent": entry["search_intent"],
        "primary_distribution": "Multi-channel",
        "series": entry.get("series"),
        "sources": ["Video Engine proposal history", "curated California PI topic bank"],
        "seo_rationale": "Addresses a real, currently-unaddressed statewide search intent with the largest relevant audience.",
        "target_page_or_cluster": "California personal injury content cluster",
        "expected_role": entry.get("expected_role", "search acquisition"),
    }
