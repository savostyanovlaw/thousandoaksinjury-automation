# Technical SEO Watchdog Design

## Purpose

Build an autonomous production monitor for `https://thousandoaksinjury.com` that detects critical technical/SEO failures, opens or updates one deduplicated GitHub issue per failure, and automatically closes the issue after recovery. Healthy runs remain silent.

## Schedule

The watchdog runs:

- after every push to `main`; and
- automatically every 12 hours.

A manual `workflow_dispatch` trigger is also available for diagnostics.

## Architecture

Use GitHub Actions as the scheduler and execution environment. A focused Python script performs production checks and emits a machine-readable JSON report. A second Python script reconciles current failures against GitHub issues using stable watchdog fingerprints.

No Cloudflare Worker, external uptime vendor, database, or additional credential is required. The workflow uses the repository-scoped `GITHUB_TOKEN` with `contents: read` and `issues: write` permissions.

## Production Checks

### Critical route availability

Check the homepage plus a maintained list of key indexed routes. Each must resolve without a redirect loop and end on the production HTTPS host with HTTP 200.

Initial route set:

- `/`
- `/agoura-hills/`
- `/westlake-village/`
- `/oak-park/`
- `/newbury-park/`
- `/camarillo/`
- `/simi-valley/`
- `/ru/`

### robots.txt

`/robots.txt` must:

- return HTTP 200;
- not contain a global `Disallow: /` directive applicable to `User-agent: *`; and
- reference the production sitemap URL.

### sitemap.xml

`/sitemap.xml` must:

- return HTTP 200;
- parse as XML;
- contain at least one URL;
- contain only canonical production-host URLs for monitored entries; and
- include the homepage.

A bounded sample of sitemap URLs is also checked for HTTP status, canonical, and noindex to catch broad deployment regressions without turning every run into a full crawler.

### Canonicals

Every monitored HTML route must contain exactly one canonical link. It must:

- use HTTPS;
- use host `thousandoaksinjury.com`;
- contain the expected route path after normalizing trailing slash; and
- never point to preview, Pages, staging, localhost, or another host.

### Indexability

Monitored HTML routes must not contain an indexing prohibition through either:

- `<meta name="robots" ... noindex ...>`; or
- `X-Robots-Tag: noindex` response headers.

### Core contact links

The homepage must retain at least one `tel:` link and one `mailto:` link. This protects the site's primary lead-contact paths against accidental redesign regressions.

### Case-review endpoint

`GET /api/case-review` is used as the safe reachability probe. The watchdog must never submit a POST payload or create a real lead. Any 5xx, network failure, or route disappearance is critical. A documented non-5xx GET response is accepted as reachable so endpoint semantics can remain intentionally non-submitting.

## Failure Model

Each failure has:

- `fingerprint`: stable identifier such as `watchdog:canonical:/westlake-village/`;
- `title`: concise human-readable issue title;
- `check`: check category;
- `url`: affected production URL;
- `evidence`: observed status/value/error;
- `recommended_fix`: actionable remediation guidance.

The check process exits non-zero when at least one critical failure exists, but issue reconciliation still runs by using `if: always()` in the workflow.

## GitHub Issue Lifecycle

Issues created by this subsystem use a deterministic marker in the body:

`<!-- technical-seo-watchdog:<fingerprint> -->`

For each current failure:

1. Search open and closed issues for the marker.
2. If none exists, create an issue.
3. If an open issue exists, add a new evidence comment only when the current observation differs from the last recorded state or enough time has elapsed to warrant a heartbeat.
4. If only a closed issue exists and the same failure recurs, reopen it and comment with recurrence evidence.

For each previously tracked open watchdog issue no longer present in the current failure report:

1. Add a recovery comment with the successful run timestamp.
2. Close the issue as completed.

Healthy runs with no previously open watchdog issues produce no issue/comment notification.

## Safety and Noise Control

- No automatic code changes or production deploys are made by the watchdog.
- The watchdog only creates, comments on, reopens, and closes its own fingerprinted issues.
- Network requests use explicit timeouts and a normal crawler user agent.
- A transient request is retried before being classified as a failure.
- Issue deduplication prevents one recurring defect from creating repeated issues.
- The endpoint probe never sends a real case-review submission.

## Testing

Unit tests cover robots parsing, canonical validation, noindex detection, sitemap parsing, contact-link detection, endpoint status classification, deterministic fingerprints, and issue-state reconciliation decisions.

The GitHub Actions workflow is validated for all three triggers: push to `main`, 12-hour cron, and manual dispatch. The implementation must pass the existing repository test suite in addition to new watchdog tests.

## Success Criteria

The subsystem is complete when:

1. A push to `main` triggers the production watchdog.
2. Scheduled runs occur every 12 hours.
3. Healthy production creates no issue noise.
4. A simulated critical failure produces one deterministic issue payload with evidence and a recommended fix.
5. Repeated identical failures do not create duplicate issues.
6. Recovery closes the corresponding open issue automatically.
7. Recurrence reopens the same issue rather than creating a new one.
8. The case-review probe never submits a real lead.
