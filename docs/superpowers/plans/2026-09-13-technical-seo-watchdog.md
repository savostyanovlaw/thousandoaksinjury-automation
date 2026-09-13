# Technical SEO Watchdog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an autonomous production Technical SEO Watchdog for `https://thousandoaksinjury.com` that runs after every push to `main` and every 12 hours, opens or updates one deduplicated GitHub issue per critical failure, and automatically closes that issue after recovery.

**Architecture:** A pure-Python production checker performs live HTTP/HTML/XML validations and writes a JSON report. A separate issue reconciler uses the GitHub REST API through the workflow-provided `GITHUB_TOKEN` to create, comment on, reopen, and close only fingerprinted watchdog issues. GitHub Actions schedules and orchestrates both components.

**Tech Stack:** Python 3.12 standard library, GitHub Actions, GitHub REST API, existing unittest suite.

**Spec:** `docs/superpowers/specs/2026-09-13-technical-seo-watchdog-design.md`

## Global Constraints

- Production base URL is exactly `https://thousandoaksinjury.com`.
- Run after every push to `main` and every 12 hours.
- Healthy runs must remain silent.
- The watchdog must never POST a real case-review lead.
- Use only repository-scoped `GITHUB_TOKEN`; no new secret is required.
- No automatic code changes or production deploys from the watchdog.
- Existing repository tests must continue to pass.

---

### Task 1: Production checker core

**Files:**
- Create: `scripts/technical_seo_watchdog.py`
- Create: `tests/test_technical_seo_watchdog.py`

**Interfaces:**
- Produces `Failure` records serialized as JSON objects with `fingerprint`, `title`, `check`, `url`, `evidence`, and `recommended_fix`.
- Produces `run_checks(base_url: str) -> list[Failure]`.
- CLI writes JSON report to the path supplied by `--output` and exits `1` when failures exist, otherwise `0`.

- [ ] **Step 1: Write failing unit tests**

Cover:

```python
from scripts.technical_seo_watchdog import (
    normalize_path,
    parse_robots,
    parse_sitemap,
    inspect_html,
    classify_case_review_get,
    make_failure,
)


def test_global_robots_disallow_is_critical():
    result = parse_robots("User-agent: *\nDisallow: /\n")
    assert result.global_disallow is True


def test_robots_requires_production_sitemap():
    result = parse_robots("User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\n")
    assert "https://thousandoaksinjury.com/sitemap.xml" not in result.sitemaps


def test_sitemap_extracts_production_urls():
    xml = """<?xml version='1.0'?><urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9'><url><loc>https://thousandoaksinjury.com/</loc></url></urlset>"""
    assert parse_sitemap(xml) == ["https://thousandoaksinjury.com/"]


def test_html_detects_canonical_noindex_and_contacts():
    html = """<html><head><link rel='canonical' href='https://thousandoaksinjury.com/'><meta name='robots' content='index,follow'></head><body><a href='tel:+18055551212'>Call</a><a href='mailto:attorney@savostyanovlaw.com'>Email</a></body></html>"""
    result = inspect_html(html)
    assert result.canonicals == ["https://thousandoaksinjury.com/"]
    assert result.noindex is False
    assert result.has_tel is True
    assert result.has_mailto is True


def test_case_review_get_accepts_non_5xx_response():
    assert classify_case_review_get(200) is None
    assert classify_case_review_get(405) is None
    assert classify_case_review_get(500) is not None


def test_failure_fingerprint_is_deterministic():
    failure = make_failure("canonical", "/westlake-village/", "bad host", "fix canonical")
    assert failure.fingerprint == "watchdog:canonical:/westlake-village/"
```

- [ ] **Step 2: Run the new test module and confirm failure**

Run: `python3 -m unittest tests.test_technical_seo_watchdog -v`

Expected: import/module failures because `scripts/technical_seo_watchdog.py` does not yet exist.

- [ ] **Step 3: Implement pure parsing/validation helpers**

Use only Python standard library modules: `argparse`, `dataclasses`, `html.parser`, `json`, `time`, `urllib.error`, `urllib.parse`, `urllib.request`, and `xml.etree.ElementTree`.

Implement:

```python
@dataclass(frozen=True)
class Failure:
    fingerprint: str
    title: str
    check: str
    url: str
    evidence: str
    recommended_fix: str


def normalize_path(path: str) -> str: ...
def parse_robots(text: str) -> RobotsInfo: ...
def parse_sitemap(xml_text: str) -> list[str]: ...
def inspect_html(html_text: str) -> HtmlInfo: ...
def classify_case_review_get(status: int) -> str | None: ...
def make_failure(check: str, route: str, evidence: str, recommended_fix: str) -> Failure: ...
```

`inspect_html` must recognize canonical links, robots meta noindex, `tel:` links, and `mailto:` links case-insensitively.

- [ ] **Step 4: Run helper tests**

Run: `python3 -m unittest tests.test_technical_seo_watchdog -v`

Expected: helper tests pass.

- [ ] **Step 5: Add HTTP execution and live check orchestration**

Implement an HTTP fetch helper with:

- normal `TechnicalSEO-Watchdog/1.0` user agent;
- 10-second timeout;
- one retry after a short delay for network/5xx failures;
- final URL capture;
- response headers capture;
- decoded text body for HTML/XML/text resources.

Implement the exact monitored route list from the spec, robots validation, sitemap validation, canonical validation, noindex header/meta validation, homepage `tel:` and `mailto:` validation, bounded sitemap sampling, and `GET /api/case-review` reachability without POST.

- [ ] **Step 6: Add CLI report output**

Support:

```bash
python3 scripts/technical_seo_watchdog.py \
  --base-url https://thousandoaksinjury.com \
  --output artifacts/technical-seo-watchdog/report.json
```

Report shape:

```json
{
  "base_url": "https://thousandoaksinjury.com",
  "checked_at": "2026-09-13T00:00:00Z",
  "healthy": true,
  "failures": []
}
```

The script exits `1` when `failures` is non-empty but always writes the report first.

- [ ] **Step 7: Run all Python tests**

Run: `python3 -m unittest discover -s tests -v`

Expected: all tests pass.

- [ ] **Step 8: Commit Task 1**

```bash
git add scripts/technical_seo_watchdog.py tests/test_technical_seo_watchdog.py
git commit -m "feat: add production technical SEO checks"
```

---

### Task 2: GitHub issue reconciler

**Files:**
- Create: `scripts/reconcile_watchdog_issues.py`
- Create: `tests/test_reconcile_watchdog_issues.py`

**Interfaces:**
- Consumes the JSON report produced by Task 1.
- Produces deterministic issue titles/bodies/comments and reconciliation actions.
- Uses environment variables `GITHUB_TOKEN` and `GITHUB_REPOSITORY` only in CLI/network code.

- [ ] **Step 1: Write failing decision-logic tests**

Cover:

```python
from scripts.reconcile_watchdog_issues import (
    issue_marker,
    desired_actions,
)


def test_marker_is_stable():
    assert issue_marker("watchdog:canonical:/") == "<!-- technical-seo-watchdog:watchdog:canonical:/ -->"


def test_new_failure_creates_issue():
    actions = desired_actions(current_failures=[{"fingerprint": "watchdog:route:/"}], tracked_issues=[])
    assert actions[0]["action"] == "create"


def test_open_same_failure_does_not_duplicate():
    actions = desired_actions(
        current_failures=[{"fingerprint": "watchdog:route:/", "evidence": "500"}],
        tracked_issues=[{"number": 4, "state": "open", "fingerprint": "watchdog:route:/", "last_evidence": "500"}],
    )
    assert not any(a["action"] == "create" for a in actions)


def test_recovered_failure_closes_issue():
    actions = desired_actions(
        current_failures=[],
        tracked_issues=[{"number": 4, "state": "open", "fingerprint": "watchdog:route:/", "last_evidence": "500"}],
    )
    assert actions == [{"action": "recover", "issue_number": 4}]


def test_recurring_failure_reopens_same_issue():
    actions = desired_actions(
        current_failures=[{"fingerprint": "watchdog:route:/", "evidence": "500"}],
        tracked_issues=[{"number": 4, "state": "closed", "fingerprint": "watchdog:route:/", "last_evidence": "200"}],
    )
    assert actions[0]["action"] == "reopen"
```

- [ ] **Step 2: Run test and confirm failure**

Run: `python3 -m unittest tests.test_reconcile_watchdog_issues -v`

Expected: import/module failure.

- [ ] **Step 3: Implement pure reconciliation logic**

Implement deterministic helpers for marker extraction, issue body rendering, evidence rendering, and actions `create`, `comment`, `reopen`, and `recover`.

Do not let the reconciler mutate issues lacking the watchdog marker.

- [ ] **Step 4: Implement GitHub REST client**

Using `urllib.request`, implement:

- list repository issues including closed issues;
- create issue;
- create issue comment;
- reopen issue;
- close issue with `state_reason=completed`.

Send `Authorization: Bearer <GITHUB_TOKEN>`, `Accept: application/vnd.github+json`, and `X-GitHub-Api-Version: 2022-11-28`.

- [ ] **Step 5: Run reconciler tests and entire Python suite**

Run:

```bash
python3 -m unittest tests.test_reconcile_watchdog_issues -v
python3 -m unittest discover -s tests -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/reconcile_watchdog_issues.py tests/test_reconcile_watchdog_issues.py
git commit -m "feat: reconcile technical SEO watchdog issues"
```

---

### Task 3: GitHub Actions scheduling and orchestration

**Files:**
- Create: `.github/workflows/technical-seo-watchdog.yml`
- Create: `tests/test_technical_seo_watchdog_workflow.py`

**Interfaces:**
- Executes Task 1 checker.
- Always executes Task 2 reconciler even if the checker exits non-zero.
- Grants exactly `contents: read` and `issues: write`.

- [ ] **Step 1: Write failing workflow structure test**

Parse workflow text and assert it contains:

```python
assert "push:" in workflow
assert "- main" in workflow
assert "schedule:" in workflow
assert "0 */12 * * *" in workflow
assert "workflow_dispatch:" in workflow
assert "issues: write" in workflow
assert "contents: read" in workflow
assert "technical_seo_watchdog.py" in workflow
assert "reconcile_watchdog_issues.py" in workflow
assert "if: always()" in workflow
```

- [ ] **Step 2: Run workflow test and confirm failure**

Run: `python3 -m unittest tests.test_technical_seo_watchdog_workflow -v`

Expected: failure because workflow does not exist.

- [ ] **Step 3: Create workflow**

Use:

```yaml
name: Technical SEO Watchdog

on:
  push:
    branches:
      - main
  schedule:
    - cron: '0 */12 * * *'
  workflow_dispatch:

permissions:
  contents: read
  issues: write
```

Job steps:

1. checkout;
2. setup Python 3.12;
3. create artifact directory;
4. run checker with `continue-on-error: true` and capture its outcome;
5. run reconciler with `if: always()` and `GITHUB_TOKEN` / `GITHUB_REPOSITORY` environment values;
6. upload report artifact with `if: always()` and 14-day retention;
7. fail the job at the end when the checker found critical failures so Actions visibly reflects unhealthy production while reconciliation has already completed.

- [ ] **Step 4: Run workflow and entire repository tests**

Run:

```bash
python3 -m unittest discover -s tests -v
node --test tests/case-review-endpoint.test.mjs
python3 scripts/validate_site.py --root website
```

Expected: all commands pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add .github/workflows/technical-seo-watchdog.yml tests/test_technical_seo_watchdog_workflow.py
git commit -m "ci: schedule technical SEO watchdog"
```

---

### Task 4: Verify against production safely and prepare PR

**Files:**
- Modify only if verification exposes a watchdog defect; production website files are out of scope for this task.

**Interfaces:**
- Uses the production URL in read-only mode.
- Must not submit `POST /api/case-review`.

- [ ] **Step 1: Run checker against production**

Run:

```bash
python3 scripts/technical_seo_watchdog.py \
  --base-url https://thousandoaksinjury.com \
  --output /tmp/technical-seo-watchdog-report.json
```

Inspect the JSON report. If production is healthy, expect exit `0` and `"healthy": true`. If a genuine production problem exists, preserve that evidence; do not alter production as part of this feature implementation.

- [ ] **Step 2: Verify report contains no lead submission code path**

Run a source check confirming the checker references only `GET` behavior for `/api/case-review` and contains no POST request construction.

- [ ] **Step 3: Run complete verification**

Run:

```bash
python3 -m unittest discover -s tests -v
node --test tests/case-review-endpoint.test.mjs
python3 scripts/validate_site.py --root website
```

Expected: all pass.

- [ ] **Step 4: Review branch diff for scope**

Expected changed files are limited to:

- `docs/superpowers/specs/2026-09-13-technical-seo-watchdog-design.md`
- `docs/superpowers/plans/2026-09-13-technical-seo-watchdog.md`
- `scripts/technical_seo_watchdog.py`
- `scripts/reconcile_watchdog_issues.py`
- `tests/test_technical_seo_watchdog.py`
- `tests/test_reconcile_watchdog_issues.py`
- `tests/test_technical_seo_watchdog_workflow.py`
- `.github/workflows/technical-seo-watchdog.yml`

- [ ] **Step 5: Open pull request**

PR title:

`Add autonomous Technical SEO Watchdog`

PR body must summarize checks, 12-hour/push schedule, issue lifecycle, safe case-review GET probe, test results, and any production findings.
