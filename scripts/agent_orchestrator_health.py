"""Fleet health evaluation for the Agent Orchestrator.

This distinguishes two real, code-verified categories of agent, instead of
treating every agent as if it must run on a fixed cadence:

- SCHEDULED agents own a `schedule:` cron trigger in their workflow file and
  are expected to produce a fresh successful run within max_hours on their
  own, with no human or upstream agent involved.
- EVENT_DRIVEN agents have no schedule trigger at all -- they only run when
  a real upstream event (another agent's approved output, an explicit
  operator dispatch) supplies real input. Going a long time with no run is
  the correct, healthy state for one of these while nothing new has
  happened; it is not evidence of failure. A run that DID happen and failed
  is still a real failure regardless of trigger type.

tests/test_agent_orchestrator_health.py cross-checks this table against the
actual `on:` triggers in .github/workflows/*.yml so this classification
cannot silently drift from the code that defines it.
"""

from datetime import datetime, timezone

SCHEDULED = "scheduled"
EVENT_DRIVEN = "event_driven"

EXPECTED_AGENTS = {
    "Technical SEO Watchdog": {"trigger": SCHEDULED, "max_hours": 18, "workflow": "technical-seo-watchdog.yml"},
    "Opportunity Finder": {"trigger": SCHEDULED, "max_hours": 96, "workflow": "opportunity-finder.yml"},
    "Competitor Monitor": {"trigger": SCHEDULED, "max_hours": 120, "workflow": "competitor-monitor.yml"},
    "CTR Optimizer": {"trigger": SCHEDULED, "max_hours": 216, "workflow": "ctr-optimizer.yml"},
    "Internal Link Builder": {"trigger": SCHEDULED, "max_hours": 216, "workflow": "internal-link-builder.yml"},
    "Local SEO Robot": {"trigger": SCHEDULED, "max_hours": 120, "workflow": "local-seo-robot.yml"},
    "Content Creator": {"trigger": EVENT_DRIVEN, "workflow": "content-creator.yml"},
    "Content Refresher": {"trigger": EVENT_DRIVEN, "workflow": "content-refresher.yml"},
    "Russian Language Robot": {"trigger": EVENT_DRIVEN, "workflow": "russian-language-robot.yml"},
    "Video Engine": {"trigger": EVENT_DRIVEN, "workflow": "video-engine.yml"},
}

_QUALIFYING_EVENTS = ("schedule", "push", "workflow_dispatch")


def evaluate_fleet_health(runs, now=None):
    now = now or datetime.now(timezone.utc)
    latest = {}
    for run in runs:
        name = run.get("name")
        if name in EXPECTED_AGENTS and run.get("event") in _QUALIFYING_EVENTS:
            latest.setdefault(name, run)

    findings = []
    for name, spec in EXPECTED_AGENTS.items():
        run = latest.get(name)
        if not run:
            if spec["trigger"] == SCHEDULED:
                findings.append({
                    "findingType": "agent_missing",
                    "title": f"{name} has no recent autonomous run",
                    "summary": "No qualifying workflow run found in the latest checked repository runs.",
                    "recommendedAction": "Inspect workflow trigger and scheduling.",
                })
            # Event-driven agents with no run yet are legitimately idle:
            # nothing has produced a real upstream event for them. That is
            # not a finding.
            continue

        stamp = run.get("updated_at") or run.get("created_at")
        age_hours = (now - datetime.fromisoformat(stamp.replace("Z", "+00:00"))).total_seconds() / 3600
        if spec["trigger"] == SCHEDULED and age_hours > spec["max_hours"]:
            findings.append({
                "findingType": "agent_stale",
                "title": f"{name} is stale",
                "summary": f"Last run is {age_hours:.1f}h old; threshold {spec['max_hours']}h.",
                "recommendedAction": "Inspect schedule/trigger and rerun safely.",
            })

        # A completed-but-failed run is a real defect for ANY agent,
        # scheduled or event-driven -- trigger type only excuses the
        # absence of a run, never the failure of one that did happen.
        if run.get("status") == "completed" and run.get("conclusion") not in ("success", "neutral"):
            findings.append({
                "findingType": "agent_failed",
                "title": f"{name} last run failed",
                "summary": f"Run #{run.get('run_number')} concluded {run.get('conclusion')}.",
                "recommendedAction": "Inspect the failed workflow and repair the agent runtime.",
                "url": run.get("html_url"),
            })

    return {"healthy": not findings, "findings": findings, "checkedAgents": len(EXPECTED_AGENTS)}
