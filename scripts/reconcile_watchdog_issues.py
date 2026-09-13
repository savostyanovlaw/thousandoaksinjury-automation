#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import urllib.error
import urllib.request

API_VERSION = "2022-11-28"
MARKER_PREFIX = "technical-seo-watchdog:"
EVIDENCE_PREFIX = "technical-seo-watchdog-evidence:"


def issue_marker(fingerprint: str) -> str:
    return f"<!-- {MARKER_PREFIX}{fingerprint} -->"


def evidence_hash(evidence: str) -> str:
    return hashlib.sha256(evidence.encode("utf-8")).hexdigest()[:16]


def evidence_marker(evidence: str) -> str:
    return f"<!-- {EVIDENCE_PREFIX}{evidence_hash(evidence)} -->"


def extract_fingerprint(body: str) -> str | None:
    match = re.search(r"<!--\s*technical-seo-watchdog:(watchdog:[^\s]+)\s*-->", body or "")
    return match.group(1) if match else None


def extract_evidence_hash(body: str) -> str | None:
    match = re.search(r"<!--\s*technical-seo-watchdog-evidence:([0-9a-f]{16})\s*-->", body or "")
    return match.group(1) if match else None


def render_issue_body(failure: dict) -> str:
    return "\n".join(
        [
            issue_marker(failure["fingerprint"]),
            evidence_marker(failure.get("evidence", "")),
            "## Production failure detected",
            "",
            f"**Check:** `{failure.get('check', '')}`",
            f"**URL:** {failure.get('url', '')}",
            "",
            "### Evidence",
            "",
            f"```text\n{failure.get('evidence', '')}\n```",
            "",
            "### Recommended fix",
            "",
            failure.get("recommended_fix", "Investigate and restore the expected production behavior."),
            "",
            "This issue is managed automatically by the Technical SEO Watchdog. It will be closed after the check recovers.",
        ]
    )


def render_failure_comment(failure: dict) -> str:
    timestamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return (
        f"Watchdog observed updated failure evidence at `{timestamp}`.\n\n"
        f"```text\n{failure.get('evidence', '')}\n```\n\n"
        f"Recommended fix: {failure.get('recommended_fix', 'Investigate the production regression.')}"
    )


def render_recurrence_comment(failure: dict) -> str:
    timestamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return (
        f"The same watchdog failure recurred at `{timestamp}`; reopening this issue.\n\n"
        f"```text\n{failure.get('evidence', '')}\n```"
    )


def render_recovery_comment() -> str:
    timestamp = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return f"Watchdog recovery confirmed at `{timestamp}`. The production check is passing again; closing automatically."


def desired_actions(current_failures: list[dict], tracked_issues: list[dict]) -> list[dict]:
    current = {f["fingerprint"]: f for f in current_failures}
    tracked = {i["fingerprint"]: i for i in tracked_issues if i.get("fingerprint")}
    actions: list[dict] = []

    for fingerprint, failure in current.items():
        issue = tracked.get(fingerprint)
        if issue is None:
            actions.append({"action": "create", "failure": failure})
            continue
        if issue.get("state") == "closed":
            actions.append({"action": "reopen", "issue_number": issue["number"], "failure": failure})
            continue
        last_evidence = issue.get("last_evidence")
        last_hash = issue.get("last_evidence_hash")
        changed = False
        if last_evidence is not None:
            changed = last_evidence != failure.get("evidence", "")
        elif last_hash is not None:
            changed = last_hash != evidence_hash(failure.get("evidence", ""))
        if changed:
            actions.append({"action": "comment", "issue_number": issue["number"], "failure": failure})

    for fingerprint, issue in tracked.items():
        if issue.get("state") == "open" and fingerprint not in current:
            actions.append({"action": "recover", "issue_number": issue["number"]})

    return actions


class GitHubClient:
    def __init__(self, repository: str, token: str) -> None:
        if "/" not in repository:
            raise ValueError("GITHUB_REPOSITORY must be owner/repo")
        self.repository = repository
        self.token = token
        self.base = f"https://api.github.com/repos/{repository}"

    def _request(self, method: str, path_or_url: str, payload: dict | None = None):
        url = path_or_url if path_or_url.startswith("https://") else self.base + path_or_url
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            url,
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": API_VERSION,
                "User-Agent": "TechnicalSEO-Watchdog/1.0",
                **({"Content-Type": "application/json"} if data is not None else {}),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else None, response.headers
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"GitHub API {method} {url} failed: HTTP {exc.code}: {body[:500]}") from exc

    def list_issues(self) -> list[dict]:
        issues: list[dict] = []
        page = 1
        while True:
            payload, _ = self._request("GET", f"/issues?state=all&per_page=100&page={page}")
            batch = payload or []
            issues.extend(i for i in batch if "pull_request" not in i)
            if len(batch) < 100:
                break
            page += 1
        return issues

    def create_issue(self, title: str, body: str) -> dict:
        payload, _ = self._request("POST", "/issues", {"title": title, "body": body})
        return payload

    def comment(self, issue_number: int, body: str) -> None:
        self._request("POST", f"/issues/{issue_number}/comments", {"body": body})

    def update_issue(self, issue_number: int, **changes) -> None:
        self._request("PATCH", f"/issues/{issue_number}", changes)


def tracked_watchdog_issues(raw_issues: list[dict]) -> list[dict]:
    tracked: list[dict] = []
    for issue in raw_issues:
        body = issue.get("body") or ""
        fingerprint = extract_fingerprint(body)
        if not fingerprint:
            continue
        tracked.append(
            {
                "number": issue["number"],
                "state": issue.get("state", "open"),
                "fingerprint": fingerprint,
                "last_evidence_hash": extract_evidence_hash(body),
            }
        )
    return tracked


def reconcile(report: dict, client: GitHubClient) -> list[dict]:
    failures = report.get("failures") or []
    raw_issues = client.list_issues()
    tracked = tracked_watchdog_issues(raw_issues)
    actions = desired_actions(failures, tracked)

    for action in actions:
        kind = action["action"]
        if kind == "create":
            failure = action["failure"]
            client.create_issue(failure.get("title") or "[Technical SEO Watchdog] Production failure", render_issue_body(failure))
        elif kind == "comment":
            failure = action["failure"]
            number = action["issue_number"]
            client.comment(number, render_failure_comment(failure))
            client.update_issue(number, body=render_issue_body(failure))
        elif kind == "reopen":
            failure = action["failure"]
            number = action["issue_number"]
            client.update_issue(number, state="open", body=render_issue_body(failure))
            client.comment(number, render_recurrence_comment(failure))
        elif kind == "recover":
            number = action["issue_number"]
            client.comment(number, render_recovery_comment())
            client.update_issue(number, state="closed", state_reason="completed")
        else:
            raise RuntimeError(f"unsupported action: {kind}")
    return actions


def main() -> int:
    parser = argparse.ArgumentParser(description="Reconcile Technical SEO Watchdog report with GitHub issues.")
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN")
    repository = os.environ.get("GITHUB_REPOSITORY")
    if not token or not repository:
        raise SystemExit("GITHUB_TOKEN and GITHUB_REPOSITORY are required")

    with open(args.report, "r", encoding="utf-8") as handle:
        report = json.load(handle)

    actions = reconcile(report, GitHubClient(repository, token))
    print(json.dumps({"actions": actions}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
