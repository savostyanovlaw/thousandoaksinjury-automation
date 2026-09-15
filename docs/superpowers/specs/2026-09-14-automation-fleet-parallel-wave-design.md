# Automation Fleet Parallel Wave — Design Specification

Date: 2026-09-14
Repository: `savostyanovlaw/thousandoaksinjury-automation`
Status: Approved in chat on 2026-09-14

## Goal
Deploy the nine currently undeployed automation agents behind the existing AI Control Center without weakening the GREEN/YELLOW/RED governance model or coupling their development to the outstanding GitHub 403 affecting Control Center command dispatch.

## Architecture
Each agent is an independently testable subsystem with its own GitHub Actions workflow and focused implementation module. Development occurs in separate branches/PRs so independent agents can be built and validated in parallel. Shared registry/control-plane changes are reserved for a final integration PR to avoid branch conflicts.

The existing Technical SEO Watchdog remains unchanged except for separate debugging of its GitHub 403 command-dispatch path.

## Governance
- GREEN: analysis, collection, reports, diagnostics, safe retries, drafts.
- YELLOW: branch creation, tested changes, and PR preparation; never automatic production merge.
- RED: merge to main, production deployment outside an already approved merge consequence, secrets, DNS/security changes, destructive production changes; explicit owner approval required.
- No agent receives arbitrary shell, arbitrary workflow names, arbitrary repository targets, or unrestricted Cloudflare/GitHub administration.
- Browser-delivered Control Center payloads never contain credentials.

## Parallel workstreams
1. **Opportunity Finder** — discovers search-demand/content opportunities and produces ranked evidence/recommendations. GREEN analysis only in first deployment.
2. **Local SEO Robot** — audits city/local landing coverage and prepares local-SEO improvements through YELLOW PRs.
3. **Content Creator** — converts approved opportunities into page/article drafts and tested YELLOW PRs; no automatic publishing.
4. **Video Engine** — prepares video-content briefs, metadata/transcript/page assets and workflow artifacts; publishing remains outside v1 automation.
5. **CTR Optimizer** — analyzes titles/meta snippets and prepares tested title/description changes through YELLOW PRs.
6. **Internal Link Builder** — analyzes site graph and prepares deterministic internal-link changes through YELLOW PRs.
7. **Russian-Language Robot** — audits `/ru/` content parity/quality and prepares Russian-language changes through YELLOW PRs.
8. **Content Refresher** — detects stale/weak existing pages and prepares evidence-backed refresh PRs.
9. **Competitor Monitor** — collects public competitor/search evidence and reports meaningful changes/opportunities; GREEN analysis only in first deployment.

## Shared contracts
Every deployed agent must have a unique stable registry ID, explicit workflow filename, supported command list, autonomy classification, normalized run state, and tests proving unsupported commands remain unavailable. Workflows must use least-privilege GitHub permissions and must not merge to main.

Agents that prepare changes must create reviewable branch/PR output and validate changed public-site files before proposing integration. Analysis-only agents must emit durable report/artifact or issue evidence rather than silently discard results.

## Integration strategy
Agent branches do not independently edit shared `control-center/agent-registry.json`. The final fleet integration branch updates the registry and runtime registry together after individual workflows/modules pass their tests. This prevents the dashboard from advertising an agent as deployed before its implementation exists.

The integration PR adds all nine deployed states/capabilities and extends Control Center validation. Production merge remains RED and requires owner approval.

## Testing
Each workstream follows TDD and covers core ranking/transformation logic, input validation, safe failure behavior, and workflow contract. Fleet integration tests assert ten total agents, all deployed only when workflows exist, exact registered workflow names, autonomy classifications, and no credential leakage. Existing Premium Redesign Validation and Technical SEO Watchdog validation must remain green.

## Success criteria
The wave is complete when all nine agent implementations have green independent PR validation, the integration PR exposes them accurately in Control Center, no agent can bypass the autonomy model, public-site validation remains green, and production activation occurs only after explicit owner approval of the integration merge.
