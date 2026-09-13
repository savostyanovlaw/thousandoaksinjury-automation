# AI Control Center v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, authenticated operations dashboard that normalizes agent/GitHub state and safely dispatches registered commands and target-specific approvals.

**Architecture:** A separate Cloudflare Pages application serves a lightweight dashboard and server-side `/api/control/*` endpoints. A registry defines agent capabilities; GitHub-specific reads/writes live behind an adapter; authorization derives from Cloudflare Access identity; RED actions use immutable, single-use approval records. The public marketing site remains independent.

**Tech Stack:** Cloudflare Pages/Functions, vanilla HTML/CSS/JS consistent with the existing site tooling, GitHub REST API, Python/Node validation tests already used by the repository, Playwright smoke tests.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-control-center-design.md`

## Global Constraints

- Cloudflare Access permits only `savostyanovlaw@gmail.com`.
- Never expose GitHub/Cloudflare credentials in browser-delivered assets or JSON.
- Dashboard hostname is separate/non-obvious and absent from public navigation/sitemap.
- All privileged endpoints authorize server-side; UI visibility is never authorization.
- RED approval is immutable-target-specific, stale-safe, single-use, and auditable.
- No arbitrary shell, arbitrary workflow dispatch, arbitrary URL fetch, or generic admin console.
- Control Center failure must not impair `https://thousandoaksinjury.com`.
- TDD for every behavioral unit; no merge while validation is failing.

---

## File structure

- `control-center/agent-registry.json` — declarative agent/capability catalog.
- `control-center/index.html` — private dashboard shell.
- `control-center/assets/control.css` — responsive cockpit styling.
- `control-center/assets/control.js` — browser rendering and typed command calls only.
- `control-center/functions/api/control/state.js` — normalized dashboard state endpoint.
- `control-center/functions/api/control/agents/[id].js` — agent detail endpoint.
- `control-center/functions/api/control/commands.js` — GREEN/YELLOW registered command dispatcher.
- `control-center/functions/api/control/approvals.js` — approval listing/creation decision boundary.
- `control-center/functions/api/control/approvals/[id].js` — APPROVE/REJECT execution boundary.
- `control-center/lib/auth.js` — Cloudflare Access identity validation/allowlist.
- `control-center/lib/registry.js` — registry validation and capability lookup.
- `control-center/lib/status.js` — deterministic state precedence and supersession logic.
- `control-center/lib/github.js` — normalized GitHub adapter.
- `control-center/lib/approvals.js` — immutable target hash, stale/single-use checks.
- `control-center/lib/audit.js` — secret-safe audit event writer.
- `control-center/lib/http.js` — JSON/error/idempotency helpers.
- `control-center/_headers` — noindex/security headers.
- `.github/workflows/control-center-validation.yml` — CI for unit/security/UI checks.
- `tests/control-center/*.test.js` — unit/API tests.
- `tests/control-center-ui.spec.js` — Playwright responsive smoke tests.

### Task 1: Agent registry and deterministic status model

**Interfaces:** Produces `loadRegistry()`, `getAgent(id)`, `deriveAgentStatus(input)` consumed by API tasks.

- [ ] Write failing tests asserting ten registry entries, only Watchdog deployed initially, unsupported commands hidden, and status precedence `WAITING APPROVAL > RUNNING > NEEDS ATTENTION > HEALTHY > NOT DEPLOYED > DISABLED` with explicit disabled/not-deployed handling.
- [ ] Run `node --test tests/control-center/registry.test.js tests/control-center/status.test.js`; expect failures because modules do not exist.
- [ ] Create `agent-registry.json`, `lib/registry.js`, and `lib/status.js`; validate unique IDs, known autonomy classes (`GREEN`,`YELLOW`,`RED`), registered workflow names only, and normalize superseded historical failures to resolved state.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat(control-center): add agent registry and status model`.

### Task 2: Cloudflare Access authorization boundary

**Interfaces:** Produces `requireAuthorizedUser(request, env) -> {email}` and `AUTHORIZED_EMAIL` configuration; every state-changing handler consumes it.

- [ ] Write failing tests for missing Access identity, wrong email, authorized `savostyanovlaw@gmail.com`, malformed identity, and fail-closed behavior.
- [ ] Run `node --test tests/control-center/auth.test.js`; expect FAIL.
- [ ] Implement `lib/auth.js` so identity is validated server-side from Cloudflare Access-provided identity/JWT context; never trust a browser-supplied email header/body field. Compare normalized email exactly to the configured allowlist.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat(control-center): enforce private Access identity`.

### Task 3: GitHub adapter and Watchdog normalization

**Interfaces:** Produces `getWorkflowState(agent)`, `listAgentIssues(agent)`, `listAgentPulls(agent)`, `dispatchRegisteredWorkflow(agent, command, idempotencyKey)` returning normalized objects without credentials.

- [ ] Write fixture-driven failing tests for successful Watchdog run, active operational failure, superseded failed development run, open/closed Watchdog issue, GitHub unavailable, and duplicate dispatch protection.
- [ ] Run `node --test tests/control-center/github.test.js`; expect FAIL.
- [ ] Implement `lib/github.js` using server-side `GITHUB_TOKEN`, repository allowlist `savostyanovlaw/thousandoaksinjury-automation`, and registry-resolved workflow IDs. Do not accept repository/workflow names directly from client input.
- [ ] Return stale/unavailable normalized state on read failures rather than declaring production unhealthy.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat(control-center): add GitHub agent adapter`.

### Task 4: Dashboard state and agent detail APIs

**Interfaces:** `GET /api/control/state` and `GET /api/control/agents/:id`; browser consumes normalized JSON only.

- [ ] Write failing API tests requiring auth and asserting summary counts, Watchdog state, nine future agents as `NOT DEPLOYED`, activity/attention separation, no secret/token fields, and graceful GitHub-unavailable state.
- [ ] Run API tests; expect FAIL.
- [ ] Implement state/detail handlers using registry/status/GitHub adapter; include `generatedAt`, `stale` metadata, supported capabilities, and deep GitHub URLs only.
- [ ] Add recursive browser-payload secret-key test rejecting keys matching token/secret/password/key credential patterns.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat(control-center): expose normalized control state`.

### Task 5: Safe GREEN/YELLOW command dispatch

**Interfaces:** `POST /api/control/commands` accepts `{agentId, command, idempotencyKey}` only; resolves target internally.

- [ ] Write failing tests for Watchdog `RUN_NOW`, unsupported command, undeployed agent, arbitrary workflow injection attempt, unauthorized caller, duplicate idempotency key, and RED command rejection at this endpoint.
- [ ] Run command tests; expect FAIL.
- [ ] Implement `lib/http.js` idempotency/error helpers and `commands.js`; authorize first, resolve capability from registry, allow GREEN/YELLOW only, and dispatch only exact registered workflow/action.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat(control-center): add safe command dispatcher`.

### Task 6: RED approval model and audit trail

**Interfaces:** Approval record includes `id`, `agentId`, `action`, `targetType`, `targetId`, `targetRevision`, `payloadHash`, `status`, `createdAt`, `decidedAt`, `decidedBy`; audit writer accepts secret-free event objects.

- [ ] Write failing tests for exact-target approval, changed PR head SHA/stale target rejection, replay rejection, reject path, unauthorized decision, and secret redaction in audit output.
- [ ] Run approval/audit tests; expect FAIL.
- [ ] Implement `lib/approvals.js` using canonical JSON + SHA-256 target hash and compare current target revision immediately before execution. Persist approval/idempotency/audit state in a Cloudflare binding chosen for durable atomic state (D1 preferred for v1); schema includes unique approval ID and consumed timestamp.
- [ ] Implement approval list/decision endpoints; `APPROVE` executes only the immutable registered action after fresh target verification; `REJECT` never executes it.
- [ ] Implement `lib/audit.js` with explicit allowlisted fields rather than logging raw request/env objects.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `feat(control-center): add scoped approvals and audit log`.

### Task 7: Dashboard UI

**Interfaces:** Browser calls only the normalized APIs from Tasks 4–6; no direct GitHub/Cloudflare API calls.

- [ ] Write Playwright assertions for system-health summary, ten agent cards, Watchdog `RUN NOW`, `NOT DEPLOYED` future cards, Needs Attention, Needs Your Approval, agent detail, mobile viewport, loading/stale/error states, and absence of credential strings in DOM/assets.
- [ ] Run `npx playwright test tests/control-center-ui.spec.js`; expect FAIL.
- [ ] Build `index.html`, `assets/control.css`, `assets/control.js` as a responsive operations cockpit. Render buttons strictly from server-returned capabilities; require a confirmation view showing exact RED target before approval.
- [ ] Re-run Playwright tests at desktop and mobile viewport; expect PASS.
- [ ] Commit `feat(control-center): build operations dashboard`.

### Task 8: Indexing/security headers and isolated Cloudflare deployment config

**Interfaces:** Separate Control Center Pages project; public website project/config remains untouched.

- [ ] Write failing static tests asserting `X-Robots-Tag: noindex, nofollow, noarchive`, HTML robots defense-in-depth, no public sitemap/navigation reference, and security headers (`frame-ancestors 'none'`, `nosniff`, restrictive referrer policy).
- [ ] Run security/static tests; expect FAIL.
- [ ] Add `control-center/_headers` and deployment configuration/docs that bind Access-protected app, server-side GitHub secret, and approval storage. Do not commit secret values or the final non-obvious hostname.
- [ ] Re-run tests; expect PASS.
- [ ] Commit `chore(control-center): harden private deployment`.

### Task 9: Dedicated CI validation

**Interfaces:** `.github/workflows/control-center-validation.yml` gates Control Center PR changes.

- [ ] Write workflow-structure test asserting least-privilege permissions, unit/API/static/Playwright stages, and no production deployment on pull-request validation.
- [ ] Run workflow test; expect FAIL.
- [ ] Add workflow with `contents: read` by default, install only required dependencies, run Node tests and Playwright smoke coverage, upload non-sensitive failure artifacts, and never echo secrets.
- [ ] Run complete local validation suite; expect PASS.
- [ ] Commit `ci: validate AI Control Center`.

### Task 10: End-to-end Watchdog integration and deployment gate

**Interfaces:** A deployed private dashboard where Watchdog can be observed and safely dispatched; RED operations remain approval-gated.

- [ ] Add end-to-end tests with mocked GitHub proving `state -> Watchdog card -> RUN NOW -> refreshed run state`, plus `RED request -> approval -> immutable revision check -> execute once`.
- [ ] Run full suite and record exact passing commands/results in the PR description.
- [ ] Deploy the Control Center to a separate Cloudflare Pages project; generate/select the non-obvious hostname at deployment time and configure Cloudflare Access allow policy for only `savostyanovlaw@gmail.com` before treating deployment as live.
- [ ] Verify unauthenticated access is denied, authorized access succeeds, `noindex` headers are present, public website remains healthy, Watchdog state matches GitHub, and `RUN NOW` dispatches only the Watchdog workflow.
- [ ] Open implementation PR from `feature/ai-control-center` to `main`; do not merge until CI is green and the owner approves the production-impacting merge.
- [ ] Commit any deployment-documentation adjustments as `docs(control-center): document verified private deployment`.

## Final verification checklist

- [ ] `node --test tests/control-center/*.test.js` passes.
- [ ] Playwright desktop/mobile Control Center smoke tests pass.
- [ ] Dedicated Control Center workflow is green.
- [ ] Existing Premium Redesign Validation remains green.
- [ ] Existing Technical SEO Watchdog remains green.
- [ ] Unauthorized user cannot reach UI/API.
- [ ] Authorized identity is exactly `savostyanovlaw@gmail.com`.
- [ ] Browser receives no privileged secrets.
- [ ] Watchdog `RUN NOW` works without arbitrary workflow injection.
- [ ] Stale/replayed RED approvals fail.
- [ ] Public site behavior/routes/canonical/sitemap/contact form are unchanged.
