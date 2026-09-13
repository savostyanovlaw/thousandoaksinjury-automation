# AI Control Center v1 — Design Specification

Date: 2026-09-13
Repository: `savostyanovlaw/thousandoaksinjury-automation`
Status: Approved design, pending implementation plan

## 1. Purpose

Build a private operational control plane for the firm's automation system. The Control Center must translate raw GitHub/automation activity into a simple operational view, show the health and state of each AI agent, surface only issues that require attention, and allow the owner to execute or approve actions without exposing credentials or administrative controls to the public website.

The dashboard is not part of the public SEO surface. It is a separate private application whose failure must not impair `https://thousandoaksinjury.com`.

## 2. Access and privacy

The Control Center will use a separate, non-obvious hostname under the firm's Cloudflare-managed domain. The exact hostname will be selected during deployment and must not be linked from the public website, included in `sitemap.xml`, or advertised in public navigation.

Security must not depend on secrecy of the URL. Cloudflare Access will protect the entire application and allow access only to `savostyanovlaw@gmail.com`.

The application must also send `X-Robots-Tag: noindex, nofollow, noarchive` and/or equivalent HTML robots directives as defense in depth.

All state-changing API endpoints must independently validate authenticated identity server-side. UI visibility alone is not authorization.

No GitHub token, Cloudflare token, secret, credential, or privileged API key may be embedded in browser-delivered JavaScript, HTML, source maps, or static JSON.

## 3. User experience

The landing page is an operations cockpit rather than a developer console.

The top summary shows:

- overall system health;
- production website health;
- number of healthy agents;
- number of agents running;
- number of agents needing attention;
- number of actions awaiting owner approval;
- timestamp of the latest system refresh.

Statuses should use a small, stable vocabulary:

- `HEALTHY`
- `RUNNING`
- `NEEDS ATTENTION`
- `WAITING APPROVAL`
- `NOT DEPLOYED`
- `DISABLED`

Historical failed development runs must not automatically make the current system red. The dashboard should summarize the latest meaningful state and label superseded failures as resolved/no action required when a later successful run supersedes them.

## 4. Agent registry

The Control Center will use a central agent registry rather than hard-coded page-specific logic. Each agent record should define at minimum:

- stable agent ID;
- display name;
- purpose/description;
- implementation state;
- associated GitHub workflow(s), if any;
- supported commands;
- autonomy level for each command;
- expected cadence, if scheduled;
- links or selectors for related issues and pull requests.

Initial registry entries:

1. Technical SEO Watchdog
2. Opportunity Finder
3. Local SEO Robot
4. Content Creator
5. Video Engine
6. CTR Optimizer
7. Internal Link Builder
8. Russian-Language Robot
9. Content Refresher
10. Competitor Monitor

Only Technical SEO Watchdog is expected to report a live operational state initially. Undeployed agents must display `NOT DEPLOYED`, not false errors.

The registry is the extension point for future agents. Adding a normal future agent should require adding/configuring an agent record and its workflow integration, not redesigning the dashboard.

## 5. Agent cards and detail views

Each agent card shows:

- current status;
- last meaningful run time;
- latest result;
- next expected run when applicable;
- count of unresolved findings;
- count of pending approvals;
- primary safe command such as `RUN NOW` when supported.

Selecting an agent opens a detail view with:

- recent execution history;
- normalized result summaries;
- currently open related GitHub issues;
- currently open related pull requests;
- pending approvals;
- recent actions taken by the agent;
- links to underlying GitHub evidence/logs for deeper inspection.

Raw GitHub details remain available, but they are secondary to a plain-language operational summary.

## 6. Commands

v1 is an active control panel, not read-only.

Supported command classes include:

- `RUN NOW`
- `RETRY`
- `OPEN ISSUE`
- `OPEN PR` where the underlying agent supports preparing a change
- `REVIEW`
- `APPROVE`
- `REJECT`

Commands must be capability-driven. The dashboard must not display buttons for commands an agent does not support.

`RUN NOW` and `RETRY` invoke explicitly registered workflows/actions. They must not accept arbitrary workflow names or arbitrary command strings from the browser.

## 7. Autonomy model

Every executable operation is classified before it is exposed in the Control Center.

### GREEN — autonomous

Safe operational work may execute without owner approval, including:

- health checks;
- analysis and reporting;
- data collection;
- creating or updating diagnostic GitHub issues;
- preparing evidence;
- safe retries of registered jobs;
- drafting changes without publishing them.

### YELLOW — autonomous through PR

Agents may create a branch, prepare changes, run tests, and open/update a pull request. The changes must not reach production merely because the agent prepared them.

Examples include content drafts, SEO improvements, code fixes, internal-link changes, and structured data changes that are ready for human review.

### RED — explicit owner approval required

The following require an approval tied to the exact proposed action:

- merge to `main`;
- production deployment when it is not already a controlled consequence of an approved merge;
- deletion or destructive alteration of production content;
- DNS changes;
- Cloudflare security or access policy changes;
- modification of production secrets or credentials;
- other materially destructive or high-impact operations.

Approval must be scoped to an immutable action payload or revision identifier. An approval is not an open-ended permission for an agent to perform later unrelated work.

## 8. Approval queue

The dashboard has a prominent `Needs Your Approval` area.

Each approval item shows:

- requesting agent;
- exact proposed action;
- affected target, such as PR number, branch, page, or deployment;
- concise explanation of why the change is proposed;
- validation/test state;
- links to reviewable evidence;
- `APPROVE` and `REJECT` controls.

The backend must reject stale approvals when the underlying action payload, commit SHA, PR head SHA, or equivalent target revision has changed since the approval request was generated. The updated action must require a new approval.

Approvals must be single-use and recorded in the audit log.

## 9. Activity and attention feeds

The Control Center includes two distinct feeds.

### Activity

A chronological normalized record of relevant work, such as:

- agent completed a scheduled check;
- agent created an issue;
- PR prepared;
- approval granted or rejected;
- approved action executed;
- problem recovered.

### Needs Attention

Only unresolved conditions that may require intervention appear here.

A failed run that is later superseded by a successful run should be summarized as resolved and removed from active attention. This prevents historical GitHub development failures from creating permanent red noise.

## 10. Architecture

Recommended high-level flow:

`Private Cloudflare UI -> authenticated control API -> registered GitHub workflows/agent actions -> GitHub issues/PRs -> approved production changes`

The public website and the Control Center are independently deployable.

### UI layer

A lightweight responsive web application optimized for desktop but usable on a phone. It reads normalized control-plane data from the private API and never stores privileged credentials.

### Control API

Server-side endpoints provide:

- dashboard state;
- agent detail state;
- activity/attention state;
- pending approval state;
- safe command dispatch;
- approval/rejection operations.

The API validates Cloudflare Access identity and authorization for every privileged request.

### GitHub integration

GitHub is initially the authoritative execution/evidence system for workflows, PRs, issues, commit SHAs, and related status.

The Control Center normalizes GitHub data rather than replacing GitHub. Deep links remain available for troubleshooting.

### Adapter boundary

GitHub-specific retrieval and command logic should live behind a small adapter/service boundary. UI components and agent status logic consume normalized objects so future integrations such as Search Console, Analytics, Cloudflare, CallRail, or n8n do not require rewriting the UI.

## 11. State model

The dashboard should derive current agent state using deterministic precedence rather than arbitrary UI logic.

Suggested precedence:

1. pending RED approval -> `WAITING APPROVAL`;
2. current execution in progress -> `RUNNING`;
3. unresolved critical finding/current failed operational run -> `NEEDS ATTENTION`;
4. latest meaningful run successful -> `HEALTHY`;
5. agent not implemented -> `NOT DEPLOYED`;
6. explicitly disabled -> `DISABLED`.

The model must distinguish an operational failure from a superseded development/test failure.

## 12. Auditability

Every state-changing dashboard command must produce an auditable event containing at least:

- timestamp;
- authenticated user identity;
- agent ID;
- requested action;
- target identifier/revision;
- approval requirement/classification;
- result;
- relevant GitHub run/PR/issue identifier when available.

Secrets must never appear in audit records.

## 13. Error handling

If GitHub or another backend dependency is temporarily unavailable, the Control Center should show the affected data as stale/unavailable rather than infer a production failure.

Command requests must be idempotent where practical. Repeated clicks must not accidentally dispatch duplicate destructive operations.

A failed command execution must preserve the pending/failed state and provide a reviewable error without exposing credentials or sensitive raw responses.

The Control Center itself must fail closed for authorization errors.

## 14. Technical SEO Watchdog integration

The first live integration will be the existing Technical SEO Watchdog.

The dashboard should surface its current workflow state, last successful run, relevant unresolved Watchdog issues, next scheduled cadence, and a safe `RUN NOW` command.

The Watchdog's existing issue lifecycle remains authoritative for detected technical SEO problems: create/dedupe/reopen on failure and close on recovery. The dashboard consumes that state and translates it into a concise operational status rather than duplicating the detector.

## 15. Deployment isolation

The Control Center must not alter public-site routes, canonical URLs, sitemap behavior, robots behavior, or contact-form routing.

Its deployment should be separate from the public Cloudflare Pages production project whenever practical, so dashboard development and failures cannot take the public marketing site offline.

Cloudflare Access protection must be active before the production Control Center is considered deployed.

## 16. Testing requirements

At minimum, implementation must include automated coverage for:

- agent-registry validation;
- status precedence/normalization;
- `NOT DEPLOYED` behavior for future agents;
- superseded failed-run normalization;
- Cloudflare Access identity rejection/acceptance behavior at the application boundary where testable;
- capability-based command exposure;
- GREEN/YELLOW/RED authorization rules;
- stale RED approval rejection;
- single-use approval behavior;
- command idempotency/duplicate protection;
- GitHub adapter normalization;
- Watchdog status integration;
- no secret values in browser-facing payloads;
- noindex/noarchive protection;
- responsive UI smoke coverage;
- safe failure behavior when GitHub is unavailable.

No production merge should occur while Control Center validation tests are failing.

## 17. v1 boundaries

v1 intentionally does not implement all future business agents. It provides the control-plane architecture and fully integrates the existing Technical SEO Watchdog, while showing future agents as `NOT DEPLOYED`.

v1 does not attempt to replace GitHub Actions, GitHub Issues, or GitHub Pull Requests. It orchestrates and summarizes them.

v1 does not expose a generic shell, arbitrary workflow dispatcher, arbitrary URL fetcher, generic GitHub write console, or unrestricted Cloudflare administration UI.

v1 does not make the hidden hostname itself a security boundary.

## 18. Success criteria

The Control Center v1 is complete when:

1. only the authorized Cloudflare Access identity can enter the application;
2. the private application is isolated from the public website;
3. the dashboard accurately represents the Technical SEO Watchdog's current operational state;
4. all planned future agents appear without generating false alarms;
5. the owner can safely run supported GREEN commands from the dashboard;
6. YELLOW work can be represented as prepared PR work without bypassing production controls;
7. RED actions cannot execute without a fresh, target-specific owner approval;
8. stale or replayed approvals are rejected;
9. activity and attention feeds distinguish current problems from superseded historical failures;
10. the browser never receives privileged GitHub/Cloudflare secrets;
11. important commands and approvals are auditable;
12. dashboard failures do not take down or alter the public marketing site.
