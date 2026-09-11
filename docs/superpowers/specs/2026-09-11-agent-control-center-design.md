# AI Agent Control Center — Design Specification

## Purpose

Build a private operations dashboard for Thousand Oaks Injury that makes the autonomous lead-generation system visible, inspectable, and governable. The dashboard is the single place where Alexey can see what every agent is doing now, what it did recently, what it plans to do next, what opportunities it found, which GitHub work it created, and what—if anything—requires approval.

The control center is not the public law-firm website and must not expose operational data publicly.

## Product Goal

Create a private web application at `ops.thousandoaksinjury.com` with authenticated access and a live mission-control view of the lead-generation agents.

The system should minimize interruptions. Routine monitoring, scoring, issue creation, PR review, and reporting should proceed automatically. Alexey should be surfaced only when a production-risk, legal-risk, account-level, spending, or strategically material decision is required.

## V1 Scope

### 1. Mission Control Home

Display one card per agent:

1. Opportunity Finder
2. Local SEO Robot
3. Content Creator
4. Video Engine
5. CTR Optimizer
6. Internal Link Builder
7. Russian-Language Robot
8. Content Refresher
9. Technical SEO Watchdog
10. Competitor Monitor
11. Lead Capture / Attribution
12. Lead PR QA Watch

Each card shows:
- current status: `idle`, `running`, `waiting`, `failed`, `disabled`
- current task summary
- task start time
- last completed action
- last successful run time
- next scheduled run time when known
- latest output link when applicable
- health/error indicator
- count of queued items
- count of items requiring approval

The dashboard must distinguish real activity from stale state. If no heartbeat/activity has occurred within the configured freshness window, status should be shown as stale rather than pretending an agent is active.

### 2. Global Activity Feed

Chronological event stream of meaningful agent actions, for example:

- Search Console analysis started
- Opportunity scored
- GitHub issue created
- Claude implementation requested
- PR opened
- QA review completed
- Site-health alert raised
- Lead captured
- Brief generated

Each event records:
- timestamp
- agent
- event type
- summary
- related task id
- external link, if any
- status/severity

The feed must avoid storing secrets, API keys, full private case descriptions, or other unnecessary sensitive data.

### 3. Work Queues

Provide filtered views for:
- Running
- Queued
- Completed
- Failed
- Needs Approval

A task record contains:
- id
- agent id
- title
- source
- priority
- status
- created time
- started time
- completed time
- evidence links
- GitHub issue / PR reference when relevant
- result summary
- failure summary when relevant

### 4. Search Console Opportunities

Opportunity table sourced from the connected Search Console workflow.

Fields:
- query
- page
- clicks
- impressions
- CTR
- average position
- comparison period delta
- branded/non-branded
- intent category
- opportunity score
- recommended action
- assigned agent
- workflow status
- GitHub issue/PR links

The scoring model should prioritize consultation potential, PI relevance, local intent, Russian-language opportunity, positions roughly 4–20, and meaningful impressions. It must de-prioritize irrelevant legal-practice noise and vanity traffic.

### 5. GitHub Work View

Show lead-generation and SEO work connected to `savostyanovlaw/thousandoaksinjury-automation`:
- open issues created by agents
- PRs linked to those issues
- CI/check status
- review state
- merge readiness
- latest commit

The dashboard may deep-link to GitHub but must not merge directly to `main` in V1.

### 6. Lead Attribution Board

Show website-generated inquiry metadata sufficient to evaluate marketing performance without exposing unnecessary confidential case substance.

V1 lead fields:
- timestamp
- landing page
- referrer
- UTM source
- UTM medium
- UTM campaign
- language
- device class if available without fingerprinting
- inquiry delivery status

Do not display the prospect's full case narrative on the dashboard. The actual intake email remains the source for case content.

### 7. Reports

Show the latest Friday executive brief and prior briefs. The report view should summarize:
- clicks / impressions / CTR / position trends
- strongest gaining and declining pages/queries
- high-intent local opportunities
- Russian-language opportunities
- technical health
- lead counts and source distribution when available
- GitHub work completed / pending
- whether Alexey needs to act

## Architecture

### Hosting

Use Cloudflare for the control-center application so it remains close to the existing Pages/Functions deployment stack.

Preferred topology:

`ops.thousandoaksinjury.com` → Cloudflare-hosted control-center app → authenticated API endpoints → operational data store + external source adapters.

The public `thousandoaksinjury.com` site remains separate and unchanged by the control-center deployment.

### Authentication

V1 authentication: GitHub OAuth/login restricted to the approved GitHub identity/account that administers the repository.

Authorization must be explicit; successful GitHub login alone is insufficient unless the returned GitHub identity is on the allowlist.

No operational dashboard route or API may be publicly readable.

### Data Store

Use a small structured datastore suitable for Cloudflare-hosted applications to persist:
- agents
- tasks
- activity events
- opportunities
- lead attribution metadata
- report metadata
- external references

The implementation plan should prefer the simplest Cloudflare-native persistence option that supports these relational access patterns and avoids introducing a separately hosted database unless required.

### Agent State Contract

All agents report state through a common contract.

`AgentState` fields:
- `agent_id`
- `display_name`
- `status`
- `current_task_id`
- `current_task_summary`
- `last_heartbeat_at`
- `last_success_at`
- `next_run_at`
- `queued_count`
- `approval_count`
- `last_output_url`
- `last_error_summary`

### Task/Event Contract

Agents should not invent their own dashboard formats. They write normalized task and activity records through shared helper functions/API endpoints.

This allows Search Console automation, GitHub watchers, site-health checks, and future Claude workers to appear in one unified dashboard.

## Data Sources

V1 integrates:
- Google Search Console via the existing connected Search Console capability/workflow
- GitHub repository `savostyanovlaw/thousandoaksinjury-automation`
- public production site health
- existing scheduled automation results
- website inquiry attribution metadata

Potential future sources, not required for V1:
- GA4
- Google Business Profile
- call tracking
- CRM/intake system
- paid advertising

## Claude / Implementation Worker Model

The dashboard is the observability and control plane, not the coding agent itself.

Workflow:

1. Opportunity Finder identifies a high-value opportunity.
2. A normalized task is created.
3. A GitHub issue is created with acceptance criteria.
4. Claude or another implementation worker may create a branch and PR.
5. PR QA Watch reviews the change.
6. Dashboard reflects the full chain from opportunity → task → issue → PR → QA.
7. Merge/deploy remains separately controlled.

## Approval Policy

### Fully Autonomous

May proceed without asking Alexey:
- read Search Console data
- monitor site health
- analyze competitors/public web
- score opportunities
- create internal task records
- create GitHub issues
- draft content/code on non-production branches
- run tests
- review PRs and leave comments
- generate reports

### Requires Approval

Must not proceed automatically in V1:
- merge to `main`
- production deployment intentionally initiated outside normal approved merge flow
- DNS changes
- domain changes
- canonical/URL structure changes that affect indexed routes
- changes to phone/email/business identity
- legal or factual marketing claims that are not already verified
- changes to disclaimers
- paid spend
- external account permissions/secrets
- destructive data actions

## Security and Privacy

- No secrets in client JavaScript, HTML, logs, task summaries, or activity feed.
- No API tokens rendered in the UI.
- Operational endpoints require authentication.
- Lead attribution should minimize PII.
- Do not persist full intake messages in the operations database.
- Use secure cookies and CSRF-safe state handling for login/session flows.
- Production and preview environment secrets remain separated.
- Dashboard must not create a new public indexable surface; authenticated pages should also send appropriate noindex protections.

## UX Direction

Visual language should echo the approved robot concept without becoming cartoonish or distracting.

Mission Control should feel like a premium command center:
- dark navy / charcoal shell
- restrained bronze/gold highlights
- individual robot/agent identity icons
- green/amber/red status lights
- compact activity timeline
- large current-work labels
- clear evidence links
- strong desktop experience, usable mobile view

Primary user question answered within 5 seconds:

**“What are my agents doing right now, what have they accomplished, and do they need me?”**

## Error Handling

- If a source is unavailable, show `degraded`/`failed` with last successful sync time.
- Never erase prior good state merely because a polling attempt fails.
- Distinguish source failure from agent failure.
- Failed jobs create activity events with concise evidence.
- Repeated failures should surface to the existing alerting workflow.

## Testing

V1 must include:
- unit tests for state normalization and stale-status rules
- auth/authorization tests
- API tests for private endpoints
- datastore tests for task/event/opportunity writes
- tests preventing full lead narratives/secrets from entering operational records
- integration tests for GitHub mapping
- integration tests for Search Console opportunity import using fixtures/mocks
- browser smoke tests for login-protected routes and core dashboard views
- accessibility checks for keyboard navigation, labels, focus, and status semantics

## Deployment and Isolation

- Develop on a dedicated feature branch/worktree.
- Do not modify the public production website except for narrowly scoped attribution hooks explicitly covered by the implementation plan.
- `ops.thousandoaksinjury.com` must be isolated from the public site's canonical/SEO behavior.
- Initial deployment must be preview-only until authentication and authorization are verified.
- Production activation of the ops subdomain requires an explicit launch gate.

## V1 Success Criteria

V1 is successful when Alexey can log in to the private dashboard and, without opening Search Console, GitHub, or ChatGPT, can:

1. see every active agent and its current/last state;
2. see a chronological activity feed;
3. see queued/running/failed/approval-needed tasks;
4. inspect live Search Console opportunities and their downstream GitHub work;
5. inspect GitHub issue/PR/check state;
6. see lead attribution metadata without unnecessary case content;
7. read the latest executive lead-generation brief;
8. identify within seconds whether any action is required from him.

## Explicit Non-Goals for V1

- No autonomous merge to `main`.
- No autonomous paid advertising spend.
- No full CRM replacement.
- No storage of full confidential intake narratives.
- No complex multi-user permissions beyond a simple approved-user allowlist.
- No attempt to make every external agent framework interchangeable on day one.
