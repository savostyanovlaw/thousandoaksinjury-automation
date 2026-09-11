# AI Agent Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Cloudflare-hosted operations dashboard at `ops.thousandoaksinjury.com` that shows real agent state, activity, Search Console opportunities, GitHub work, lead attribution, and reports without exposing sensitive intake content or allowing autonomous production merges.

**Architecture:** Create a separate `ops/` Cloudflare Pages application with plain HTML/CSS/JS, Pages Functions, and Cloudflare D1. All workers report through a normalized operational event contract; the dashboard reads only authenticated APIs. GitHub is integrated through server-side API calls, existing n8n workflows can report through the same ingestion endpoint, and the current ChatGPT automations remain external until they are migrated or instrumented to emit the same contract.

**Tech Stack:** Cloudflare Pages + Pages Functions, Cloudflare D1, vanilla HTML/CSS/JS, GitHub OAuth, GitHub REST API, Node.js test runner, existing Python site tests unchanged.

**Spec:** `docs/superpowers/specs/2026-09-11-agent-control-center-design.md`

## Global Constraints

- The public `website/` deployment must remain functionally unchanged except for a future, narrowly scoped attribution hook explicitly covered by a separate task.
- No direct merge to `main` from the control center.
- No DNS changes, paid spend, domain/canonical changes, unverified legal claims, or destructive actions.
- Operational pages and APIs must be private and send `noindex` protections.
- No secrets, API tokens, or full intake narratives may be written to client-side code, logs, activity events, task records, or D1.
- GitHub OAuth access must be restricted by an explicit allowlist (`OPS_ALLOWED_GITHUB_LOGIN`).
- All implementation work occurs on a dedicated feature branch; initial deployment is preview-only.
- Existing public-site tests must continue to pass.

---

### Task 1: Ops application shell and test harness

**Files:**
- Create: `ops/public/index.html`
- Create: `ops/public/assets/ops.css`
- Create: `ops/public/assets/ops.js`
- Create: `ops/package.json`
- Create: `ops/tests/ui-shell.test.mjs`
- Create: `ops/_headers`
- Create: `ops/README.md`

**Interfaces:**
- Produces: static shell with elements `#agent-grid`, `#activity-feed`, `#task-board`, `#opportunities`, `#github-work`, `#lead-board`, `#reports`, and `#user-menu`.
- Produces: browser requests to `/api/session`, `/api/dashboard`, `/api/activity`, `/api/tasks`, `/api/opportunities`, `/api/github`, `/api/leads`, `/api/reports`.

- [ ] **Step 1: Write failing shell tests** verifying the required regions exist, `robots` noindex meta is present, no secret-looking tokens are embedded, and the navigation is keyboard-focusable.
- [ ] **Step 2: Run** `cd ops && npm test` and verify failure because the shell files do not yet exist.
- [ ] **Step 3: Implement the minimal premium mission-control shell** using dark navy/charcoal, restrained bronze accents, status lights, responsive agent cards, and accessible navigation.
- [ ] **Step 4: Add `_headers`** so `/*` returns `X-Robots-Tag: noindex, nofollow, noarchive` and security headers including `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive `Permissions-Policy`.
- [ ] **Step 5: Run** `npm test` and verify PASS.
- [ ] **Step 6: Commit** `feat(ops): add private control center shell`.

### Task 2: D1 schema and normalized operational contracts

**Files:**
- Create: `ops/schema/0001_initial.sql`
- Create: `ops/functions/_lib/models.js`
- Create: `ops/functions/_lib/db.js`
- Create: `ops/tests/models.test.mjs`
- Create: `ops/tests/db-contract.test.mjs`

**Interfaces:**
- Produces: `normalizeAgentState(input, now)` returning the canonical `AgentState` shape.
- Produces: `sanitizeOperationalText(value, maxLength)`.
- Produces: `isStale(lastHeartbeatAt, now, staleMinutes)`.
- Produces: tables `agents`, `tasks`, `activity_events`, `opportunities`, `lead_attribution`, `reports`, `external_refs`, `sessions`.

- [ ] **Step 1: Write failing tests** for valid statuses, stale-state conversion, timestamp normalization, text limits, rejection/redaction of secret-like values, and rejection of forbidden lead narrative fields.
- [ ] **Step 2: Run** `npm test` and verify FAIL.
- [ ] **Step 3: Implement canonical model helpers** with statuses `idle`, `running`, `waiting`, `failed`, `disabled`, `stale`, and source-health metadata.
- [ ] **Step 4: Add D1 schema** with indexed foreign keys for agent/task/event lookups and without a column capable of storing full case narratives.
- [ ] **Step 5: Run** `npm test` and verify PASS.
- [ ] **Step 6: Commit** `feat(ops): add operational data model`.

### Task 3: Authentication and private API guard

**Files:**
- Create: `ops/functions/auth/login.js`
- Create: `ops/functions/auth/callback.js`
- Create: `ops/functions/auth/logout.js`
- Create: `ops/functions/_lib/auth.js`
- Create: `ops/functions/api/session.js`
- Create: `ops/tests/auth.test.mjs`

**Interfaces:**
- Consumes env: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OPS_SESSION_SECRET`, `OPS_ALLOWED_GITHUB_LOGIN`.
- Produces: signed `HttpOnly; Secure; SameSite=Lax` session cookie named `toi_ops_session`.
- Produces: `requireSession(context)` for every private endpoint.

- [ ] **Step 1: Write failing auth tests** for unauthenticated 401 responses, OAuth state verification, denied non-allowlisted users, secure cookie attributes, logout invalidation, and session expiry.
- [ ] **Step 2: Run** `npm test` and verify FAIL.
- [ ] **Step 3: Implement GitHub OAuth login/callback** using server-side token exchange and `/user` identity lookup; accept only exact allowlisted login(s).
- [ ] **Step 4: Implement signed session cookies** using Web Crypto HMAC; store only minimal session metadata.
- [ ] **Step 5: Run** `npm test` and verify PASS.
- [ ] **Step 6: Commit** `feat(ops): add GitHub restricted authentication`.

### Task 4: Agent ingestion API and live mission-control state

**Files:**
- Create: `ops/functions/api/agent-event.js`
- Create: `ops/functions/api/dashboard.js`
- Create: `ops/functions/api/activity.js`
- Create: `ops/functions/api/tasks.js`
- Create: `ops/functions/_lib/ingest.js`
- Create: `ops/tests/ingest.test.mjs`
- Modify: `ops/public/assets/ops.js`

**Interfaces:**
- Consumes env: `OPS_INGEST_TOKEN` for machine-to-machine writes.
- Produces: `POST /api/agent-event` accepting normalized `heartbeat`, `task_started`, `task_completed`, `task_failed`, `opportunity_found`, `issue_created`, `pr_opened`, `qa_completed`, `lead_captured`, and `report_generated` events.
- Produces: authenticated read endpoints powering the mission-control home.

- [ ] **Step 1: Write failing tests** for ingest auth, event validation, stale heartbeat handling, idempotency via `event_id`, task state transitions, and secret/PII rejection.
- [ ] **Step 2: Run** `npm test` and verify FAIL.
- [ ] **Step 3: Implement ingestion and dashboard aggregation** preserving last good state when a source poll fails.
- [ ] **Step 4: Wire frontend polling** every 20 seconds while the tab is visible and every 60 seconds when hidden; show explicit stale/degraded labels rather than false live status.
- [ ] **Step 5: Run** `npm test` and verify PASS.
- [ ] **Step 6: Commit** `feat(ops): add live agent state and activity ingestion`.

### Task 5: GitHub work adapter

**Files:**
- Create: `ops/functions/api/github.js`
- Create: `ops/functions/_lib/github.js`
- Create: `ops/tests/github-adapter.test.mjs`
- Modify: `ops/public/assets/ops.js`

**Interfaces:**
- Consumes env: `GITHUB_OPS_TOKEN` with repository read scope only for V1.
- Produces: normalized issue/PR records for `savostyanovlaw/thousandoaksinjury-automation` including CI/check state and merge readiness.
- Must not expose any mutation endpoint capable of merging or updating `main`.

- [ ] **Step 1: Write failing adapter tests** using GitHub response fixtures for issue-to-PR linkage, checks, draft state, mergeability, and API failure/degraded state.
- [ ] **Step 2: Run** `npm test` and verify FAIL.
- [ ] **Step 3: Implement read-only GitHub REST adapter** with short cache windows and explicit source-health metadata.
- [ ] **Step 4: Wire GitHub work cards/table** with deep links to issues, PRs, and checks.
- [ ] **Step 5: Run** `npm test` and verify PASS.
- [ ] **Step 6: Commit** `feat(ops): add read-only GitHub work view`.

### Task 6: Search Console opportunity import and scoring

**Files:**
- Create: `ops/functions/api/opportunities.js`
- Create: `ops/functions/api/opportunity-import.js`
- Create: `ops/functions/_lib/opportunity-score.js`
- Create: `ops/tests/opportunity-score.test.mjs`
- Create: `ops/tests/fixtures/search-console.json`
- Modify: `ops/public/assets/ops.js`

**Interfaces:**
- `POST /api/opportunity-import` accepts normalized rows emitted by the existing Search Console automation; machine-authenticated with `OPS_INGEST_TOKEN`.
- Produces: `scoreOpportunity(row)` with deterministic weighting for PI relevance, local intent, Russian intent, impressions, CTR deficit, and position 4–20; irrelevant practice-area noise receives a near-zero score.

- [ ] **Step 1: Write failing scoring tests** covering local PI wins, positions 4–20, weak CTR, Russian queries, branded queries, and irrelevant business/immigration/IP/criminal queries.
- [ ] **Step 2: Run** `npm test` and verify FAIL.
- [ ] **Step 3: Implement deterministic scoring/import** and comparison-period fields.
- [ ] **Step 4: Wire sortable opportunity table** with score, evidence, recommended action, assigned agent, and GitHub links.
- [ ] **Step 5: Run** `npm test` and verify PASS.
- [ ] **Step 6: Commit** `feat(ops): add Search Console opportunity board`.

### Task 7: Lead attribution and reports

**Files:**
- Create: `ops/functions/api/lead-event.js`
- Create: `ops/functions/api/leads.js`
- Create: `ops/functions/api/reports.js`
- Create: `ops/tests/leads.test.mjs`
- Modify: `functions/api/case-review.js`
- Modify: `website/assets/city-pages.js`
- Modify: `ops/public/assets/ops.js`

**Interfaces:**
- Public site submits only attribution metadata: landing page, referrer, UTM source/medium/campaign, language, coarse device class, delivery outcome.
- No full name, phone, email, or case message is written to the ops store.
- Existing intake email remains unchanged except for including attribution metadata where useful.

- [ ] **Step 1: Write failing privacy tests** proving the ops payload contains no `name`, `phone`, `email`, or `message` field and that forbidden fields are rejected server-side.
- [ ] **Step 2: Run both** `cd ops && npm test` and `python3 -m unittest discover -s tests -v` to capture the failing/new baseline.
- [ ] **Step 3: Implement attribution capture** from existing URL/referrer values and UTM params without fingerprinting.
- [ ] **Step 4: Implement lead-event ingest and reports read API**; reports initially read persisted Friday-brief records produced through the generic agent event API.
- [ ] **Step 5: Run** ops tests, public-site unit tests, and `python3 scripts/validate_site.py --root website`; all must pass.
- [ ] **Step 6: Commit** `feat(ops): add privacy-minimized lead attribution and reports`.

### Task 8: n8n/worker instrumentation, browser smoke, and preview deployment readiness

**Files:**
- Create: `ops/scripts/emit-agent-event.mjs`
- Create: `ops/tests/browser-smoke.mjs`
- Create: `ops/wrangler.toml.example`
- Create: `docs/ops-control-center-runbook.md`
- Modify: `n8n/workflows/workflow_a_create_video.json`
- Modify: `n8n/workflows/workflow_b_poll_status.json`
- Modify: `.gitignore` only if local ops artifacts require it.

**Interfaces:**
- Provides a documented HTTP contract for n8n/Claude/GitHub/ChatGPT workers to emit heartbeats and task events.
- n8n workflow JSON adds best-effort event calls that do not break the primary video workflow if the ops endpoint is unavailable.
- Preview deployment requires D1 binding `OPS_DB` and secrets `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `OPS_SESSION_SECRET`, `OPS_ALLOWED_GITHUB_LOGIN`, `OPS_INGEST_TOKEN`, and optional read-only `GITHUB_OPS_TOKEN`.

- [ ] **Step 1: Add fixture-level tests** that n8n workflow exports contain non-blocking ops-event nodes and never include secret values.
- [ ] **Step 2: Implement worker emitter and n8n instrumentation** so workflow start/success/failure can appear in Mission Control.
- [ ] **Step 3: Add browser smoke test** for login redirect, authenticated fixture mode, agent cards, queues, activity feed, opportunities, GitHub work, lead board, reports, and mobile viewport.
- [ ] **Step 4: Write deployment runbook** with exact Cloudflare Pages root/output settings, D1 setup/migration commands, GitHub OAuth callback, preview-first verification, and explicit production launch gate for `ops.thousandoaksinjury.com`.
- [ ] **Step 5: Run complete verification:** `cd ops && npm test`; `python3 -m unittest discover -s tests -v`; `python3 scripts/validate_site.py --root website`; and browser smoke.
- [ ] **Step 6: Commit** `feat(ops): complete control center v1 preview build`.

## Final Review Gate

Before any ops production launch:

1. Confirm no secrets are in repository history or browser bundles.
2. Confirm all `/api/*` read endpoints require an authenticated allowlisted session, except machine-ingest endpoints which require `OPS_INGEST_TOKEN`.
3. Confirm machine-ingest endpoints reject forbidden PII fields.
4. Confirm GitHub integration is read-only and no merge endpoint exists.
5. Confirm public website tests/validator remain green.
6. Deploy preview only and test OAuth allowlist with the approved GitHub account.
7. Verify an unapproved GitHub account receives access denied.
8. Verify at least one real agent heartbeat/event appears in the dashboard.
9. Verify GitHub PR/check data renders from the live repo.
10. Only then request/perform the explicit `ops.thousandoaksinjury.com` production activation gate.
