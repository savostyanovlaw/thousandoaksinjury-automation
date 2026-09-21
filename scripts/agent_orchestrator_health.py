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

# A real, currently-wired event-driven chain: Content Creator's own
# workflow automatically dispatches both of these the moment it finishes
# (see .github/workflows/content-creator.yml). If Content Creator succeeds
# but neither ever starts, the automatic handoff itself is broken --
# something no per-agent "did it run" check below can see on its own, since
# each downstream agent's own absence is individually excused as
# EVENT_DRIVEN.
HANDOFF_EXPECTATIONS = {
    "Content Creator": ("Russian Language Robot", "Video Engine"),
}
HANDOFF_WINDOW_MINUTES = 20


def _parse_ts(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def detect_handoff_gaps(runs, now=None, window_minutes=HANDOFF_WINDOW_MINUTES):
    """Bounded, single check against the fleet's most recent real cycle: did
    the last successful upstream run's automatic downstream dispatch
    actually happen? Never scans unboundedly far into history, and never
    flags a handoff whose window has not fully elapsed yet (a run that
    finished 30 seconds ago has not failed to hand off -- it just hasn't
    had time to)."""
    now = now or datetime.now(timezone.utc)
    by_name = {}
    for run in runs:
        by_name.setdefault(run.get("name"), []).append(run)

    findings = []
    for upstream_name, downstream_names in HANDOFF_EXPECTATIONS.items():
        upstream_runs = [r for r in by_name.get(upstream_name, []) if r.get("status") == "completed" and r.get("conclusion") == "success" and r.get("created_at")]
        if not upstream_runs:
            continue
        latest_upstream = max(upstream_runs, key=lambda r: _parse_ts(r["created_at"]))
        upstream_time = _parse_ts(latest_upstream["created_at"])
        window_end_ts = upstream_time.timestamp() + window_minutes * 60
        if now.timestamp() < window_end_ts:
            continue
        for downstream_name in downstream_names:
            dispatched = any(
                upstream_time.timestamp() <= _parse_ts(r["created_at"]).timestamp() <= window_end_ts
                for r in by_name.get(downstream_name, []) if r.get("created_at")
            )
            if not dispatched:
                findings.append({
                    "findingType": "handoff_missing",
                    "title": f"{upstream_name} succeeded but {downstream_name} was never dispatched",
                    "summary": f"{upstream_name} run #{latest_upstream.get('run_number')} completed successfully at {latest_upstream['created_at']}, but no {downstream_name} run started within {window_minutes} minutes afterward.",
                    "recommendedAction": f"Inspect {upstream_name}'s downstream-dispatch step and {downstream_name}'s trigger wiring.",
                    "url": latest_upstream.get("html_url"),
                })
    return findings


def evaluate_fleet_health(runs, now=None):
    now = now or datetime.now(timezone.utc)
    latest = {}
    for run in runs:
        name = run.get("name")
        if name in EXPECTED_AGENTS and run.get("event") in _QUALIFYING_EVENTS:
            latest.setdefault(name, run)

    findings = list(detect_handoff_gaps(runs, now))
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
