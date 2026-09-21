"""Curated topic inventory for the Video Engine's daily California-wide strategy.

This is a static, hand-curated bank rather than a live search-data feed: this
repository has no Google Search Console, YouTube Analytics, or paid
keyword-volume integration (confirmed by inspecting every existing agent
script -- none of them call any such API). Fabricating search-volume numbers
would be worse than being explicit about that gap, so ``video_topic_selector``
combines this bank with the real signals the repository actually has (past
Video Engine output, the real page inventory under ``website/``, and other
agents' real structural findings) rather than pretending to have data this
system does not collect.

GEOGRAPHIC_SCOPES:
  california_wide -- the firm's primary audience: anyone injured in
    California, regardless of where in the state. Needs no per-market
    justification; it is the default, majority content type.
  regional -- a major California market/region (Los Angeles, San Diego, the
    Bay Area, ...). The firm has no existing landing page and no real
    per-market search-opportunity signal for any of these today, so
    ``video_topic_selector`` only ever selects one when a real, inspectable
    signal (e.g. a future Opportunity Finder/Competitor Monitor finding that
    names the market) supports it -- never on a fixed rotation.
  local -- Thousand Oaks and the real neighboring communities the site
    already has a dedicated landing page for.
"""
from __future__ import annotations

GEOGRAPHIC_SCOPES = ("california_wide", "regional", "local")

# Target rolling-mix band per scope, expressed as (low, high) fractions of
# recent output. These are targets, not quotas: video_topic_selector treats a
# real signal (an existing structural finding, an unresolved content gap) as
# an override that can beat the target mix, per the strategy's own "data
# overrides the target mix" rule.
TARGET_MIX = {
    "california_wide": (0.60, 0.70),
    "regional": (0.15, 0.25),
    "local": (0.10, 0.20),
}

# The primary content type: real questions injured Californians search for,
# answerable without reference to any specific city. Each entry's `series` is
# optional -- most topics stand alone; a few group naturally under one of the
# named recurring series so the engine can build topical/series authority
# without forcing every script into a series structure.
CALIFORNIA_WIDE_TOPICS = [
    {"topic": "what to do after a car accident in California", "series": "California Accident Questions", "search_intent": "immediate post-accident guidance", "target_audience": "recently injured drivers/passengers", "expected_role": "awareness"},
    {"topic": "uninsured motorist claims in California", "series": "Insurance Adjuster Questions", "search_intent": "coverage/claim eligibility research", "target_audience": "accident victims facing an uninsured at-fault driver", "expected_role": "search acquisition"},
    {"topic": "underinsured motorist coverage in California", "series": "Insurance Adjuster Questions", "search_intent": "coverage/claim eligibility research", "target_audience": "accident victims with a policy limits shortfall", "expected_role": "search acquisition"},
    {"topic": "comparative negligence in California", "series": "California Injury Claim Myths", "search_intent": "understanding shared-fault impact on recovery", "target_audience": "claimants told they were partly at fault", "expected_role": "topical authority"},
    {"topic": "recorded statements to insurance companies", "series": "Before You Talk to the Insurance Company", "search_intent": "risk avoidance before speaking to an adjuster", "target_audience": "claimants who just filed a claim", "expected_role": "conversion support"},
    {"topic": "insurance policy limits", "series": "Insurance Adjuster Questions", "search_intent": "understanding maximum recovery constraints", "target_audience": "claimants evaluating settlement offers", "expected_role": "search acquisition"},
    {"topic": "medical treatment after an accident", "series": "California Accident Questions", "search_intent": "practical next-step guidance", "target_audience": "recently injured claimants", "expected_role": "awareness"},
    {"topic": "gaps in medical treatment", "series": None, "search_intent": "understanding how treatment gaps affect a claim", "target_audience": "claimants who delayed or paused care", "expected_role": "topical authority"},
    {"topic": "property damage vs. bodily injury claims", "series": "California Accident Questions", "search_intent": "distinguishing claim types", "target_audience": "first-time claimants", "expected_role": "search acquisition"},
    {"topic": "hit-and-run accidents", "series": "What Happens If...?", "search_intent": "recourse when the at-fault party fled", "target_audience": "hit-and-run victims", "expected_role": "search acquisition"},
    {"topic": "pedestrian accidents", "series": None, "search_intent": "liability and recovery basics for pedestrians", "target_audience": "injured pedestrians and families", "expected_role": "search acquisition"},
    {"topic": "motorcycle accidents", "series": None, "search_intent": "bias/liability concerns specific to motorcyclists", "target_audience": "injured motorcyclists", "expected_role": "search acquisition"},
    {"topic": "bicycle accidents", "series": None, "search_intent": "liability and evidence basics for cyclists", "target_audience": "injured cyclists", "expected_role": "search acquisition"},
    {"topic": "rideshare accidents", "series": "What Happens If...?", "search_intent": "which insurance applies in an Uber/Lyft accident", "target_audience": "rideshare drivers and passengers", "expected_role": "search acquisition"},
    {"topic": "Uber and Lyft passenger claims", "series": "What Happens If...?", "search_intent": "passenger-specific claim process", "target_audience": "injured rideshare passengers", "expected_role": "search acquisition"},
    {"topic": "dog bites", "series": None, "search_intent": "California strict-liability dog bite basics", "target_audience": "dog bite victims", "expected_role": "search acquisition"},
    {"topic": "premises liability", "series": "California Injury Claim Myths", "search_intent": "property-owner liability basics", "target_audience": "injured visitors/customers", "expected_role": "topical authority"},
    {"topic": "slip-and-fall claims", "series": None, "search_intent": "evidence and liability basics for falls", "target_audience": "slip-and-fall victims", "expected_role": "search acquisition"},
    {"topic": "wrongful death claims", "series": None, "search_intent": "who can bring a claim and what it covers", "target_audience": "surviving family members", "expected_role": "search acquisition"},
    {"topic": "government claims after an accident", "series": "California Accident Questions", "search_intent": "the government-claim deadline trap", "target_audience": "claimants injured on public property/by a public vehicle", "expected_role": "topical authority"},
    {"topic": "preserving evidence after an accident", "series": "California Accident Mistakes", "search_intent": "practical evidence-preservation steps", "target_audience": "recently injured claimants", "expected_role": "conversion support"},
    {"topic": "dealing with insurance adjusters", "series": "Before You Talk to the Insurance Company", "search_intent": "adjuster tactics and how to respond", "target_audience": "claimants mid-negotiation", "expected_role": "conversion support"},
    {"topic": "litigation and settlement basics", "series": "60 Seconds of California Injury Law", "search_intent": "what litigation/settlement actually involves", "target_audience": "claimants deciding whether to pursue a claim", "expected_role": "topical authority"},
    {"topic": "California personal injury deadlines", "series": "60 Seconds of California Injury Law", "search_intent": "statute of limitations awareness", "target_audience": "anyone with an unresolved injury claim", "expected_role": "search acquisition"},
    {"topic": "common mistakes after a California car accident", "series": "California Accident Mistakes", "search_intent": "avoiding self-defeating early missteps", "target_audience": "recently injured drivers", "expected_role": "awareness"},
]

# Real, named major California markets/regions. Selected only when a real
# signal supports a specific market (see video_topic_selector.find_override);
# never on a fixed rotation.
REGIONAL_MARKETS = [
    "Los Angeles", "San Diego", "Orange County", "San Francisco Bay Area",
    "Sacramento", "Inland Empire", "San Jose", "Long Beach", "Riverside",
    "San Bernardino", "Fresno", "Bakersfield",
]

# Local communities the site already has a dedicated landing page for
# (website/<slug>/), plus the firm's home base. This mirrors the real
# directory layout rather than an independent hardcoded list, so it cannot
# silently drift from the site's actual local-page inventory.
LOCAL_MARKETS = {
    "thousand-oaks": "Thousand Oaks",
    "westlake-village": "Westlake Village",
    "newbury-park": "Newbury Park",
    "agoura-hills": "Agoura Hills",
    "oak-park": "Oak Park",
    "simi-valley": "Simi Valley",
    "camarillo": "Camarillo",
}
