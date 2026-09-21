#!/usr/bin/env python3
"""Daily orchestrator for the Video Engine's California-wide strategy.

Selects at most one video topic per America/Los_Angeles calendar day (see
scripts/video_topic_selector.py) and builds its attorney-review package, or
exits cleanly with no output if today's cap is already used.

Real history source: this repository's own past video-engine.yml runs. Every
producing agent workflow already exposes its result to the owner Review
Queue by printing `SLC_REVIEW_JSON_B64=<base64 package>` in its job log (the
same mechanism the Control Center's ingest path reads); this orchestrator
reuses that existing marker to reconstruct real proposal history instead of
maintaining a separate ledger file that could drift from what actually ran.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import urllib.error
import urllib.request

from scripts.video_engine import build_video_package
from scripts.video_topic_selector import select_next_topic

API_VERSION = "2022-11-28"
REVIEW_MARKER = re.compile(r"SLC_REVIEW_JSON_B64=([A-Za-z0-9+/=]+)")
USER_AGENT = "SavostyanovLaw-VideoEngine/1.0"


def extract_package_from_log(log_text: str) -> dict | None:
    """The log may contain the marker more than once (retries, re-runs);
    the last occurrence is the one that actually reached the ingest step.
    """
    match = None
    for match in REVIEW_MARKER.finditer(log_text or ""):
        pass
    if match is None:
        return None
    try:
        raw = base64.b64decode(match.group(1))
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return None


def history_from_runs(runs_with_logs: list[tuple[dict, list[str]]]) -> list[dict]:
    """Pure, directly unit-testable: given already-fetched (run, [job log
    text, ...]) pairs, reconstruct real Video Engine proposal history.
    """
    history = []
    for run, job_logs in runs_with_logs:
        package = None
        for log_text in job_logs:
            package = extract_package_from_log(log_text)
            if package is not None:
                break
        if package is None or package.get("agent") != "video-engine":
            continue
        history.append(
            {
                "topic": package.get("topic", ""),
                "location": package.get("location", ""),
                "geographicScope": package.get("geographicScope", ""),
                "createdAt": run.get("created_at"),
            }
        )
    history.sort(key=lambda entry: entry.get("createdAt") or "")
    return history


class GitHubClient:
    """Thin GitHub REST API glue -- deliberately untested by unit tests
    (mirrors reconcile_watchdog_issues.py's own GitHubClient, which is
    exercised live by the workflow rather than mocked at the network layer);
    history_from_runs above carries the actual testable logic.
    """

    def __init__(self, repository: str, token: str) -> None:
        self.base = f"https://api.github.com/repos/{repository}"
        self.token = token

    def _headers(self, accept="application/vnd.github+json"):
        return {
            "Authorization": f"Bearer {self.token}",
            "Accept": accept,
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": USER_AGENT,
        }

    def _get_json(self, path):
        request = urllib.request.Request(self.base + path, headers=self._headers())
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))

    def _get_text(self, url):
        request = urllib.request.Request(url, headers=self._headers("text/plain"))
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.read().decode("utf-8", "replace")

    def recent_completed_runs(self, workflow_file: str, limit: int = 60) -> list[dict]:
        payload = self._get_json(f"/actions/workflows/{workflow_file}/runs?status=completed&per_page={limit}")
        return payload.get("workflow_runs", [])

    def job_logs_for_run(self, run_id: int) -> list[str]:
        jobs = self._get_json(f"/actions/runs/{run_id}/jobs?per_page=100").get("jobs", [])
        logs = []
        for job in jobs:
            try:
                logs.append(self._get_text(f"{self.base}/actions/jobs/{job['id']}/logs"))
            except urllib.error.HTTPError:
                # Logs can expire (retention window) or a job can have none;
                # a missing log is not a reason to fail the whole run.
                continue
        return logs


def load_history(client: GitHubClient, workflow_file: str = "video-engine.yml", limit: int = 60) -> list[dict]:
    runs_with_logs = []
    for run in client.recent_completed_runs(workflow_file, limit=limit):
        try:
            runs_with_logs.append((run, client.job_logs_for_run(run["id"])))
        except urllib.error.HTTPError:
            continue
    return history_from_runs(runs_with_logs)


def load_opportunity_findings(path: str) -> list[dict]:
    if not path or not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except Exception:
        return []
    return data.get("findings") or []


def main() -> int:
    parser = argparse.ArgumentParser(description="Select and build today's Video Engine proposal, if the daily cap allows one.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--source-id", required=True)
    parser.add_argument("--opportunity-report", default="")
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    repository = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repository:
        raise SystemExit("GITHUB_TOKEN and GITHUB_REPOSITORY are required")

    client = GitHubClient(repository, token)
    history = load_history(client)
    findings = load_opportunity_findings(args.opportunity_report)

    decision = select_next_topic(history, opportunity_findings=findings)
    if not decision.get("produced"):
        print(json.dumps({"produced": False, "reason": decision.get("reason")}))
        return 0

    package = build_video_package(
        decision["topic"],
        decision["location"],
        args.source_id,
        geographic_scope=decision.get("geographic_scope"),
        why_today=decision.get("why_today"),
        data_signal_used=decision.get("data_signal_used"),
        target_audience=decision.get("target_audience"),
        search_intent=decision.get("search_intent"),
        primary_distribution=decision.get("primary_distribution"),
        series=decision.get("series"),
        sources=decision.get("sources"),
        seo_rationale=decision.get("seo_rationale"),
        target_page_or_cluster=decision.get("target_page_or_cluster"),
        expected_role=decision.get("expected_role"),
    )
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(package, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"produced": True, "topic": package["topic"], "geographicScope": package["geographicScope"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
