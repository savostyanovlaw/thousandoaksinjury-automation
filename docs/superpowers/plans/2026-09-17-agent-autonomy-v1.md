# Agent Autonomy v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Video Engine, Russian-Language Robot, Content Refresher, and Orchestrator, then verify Control Center → agent → artifact → approval → execution end to end.

**Architecture:** Each agent emits deterministic review artifacts with explicit safety state. Orchestrator passes artifacts through the existing Control Center approval boundary; external execution remains impossible until a valid approval is present.

**Tech Stack:** Python 3.12, unittest, GitHub Actions, existing Cloudflare Control Center.

**Spec:** User-approved agent autonomy workflow in project conversation; existing Control Center approval invariants in main.

## Global Constraints

- No automatic public publishing before attorney approval.
- Preserve existing website/SEO pause; agent development must not modify production website content.
- Every new behavior follows RED → GREEN TDD.
- Execution must reject pending, rejected, stale, or previously consumed approvals.

---

### Task 1: Video Engine
**Files:** `tests/test_video_engine.py`, `scripts/video_engine.py`, `.github/workflows/video-engine.yml`
- [x] Define failing review-only package contract.
- [x] Implement deterministic package generation with legal-review guardrails.
- [x] Add isolated CI workflow.
- [ ] Open PR and verify GREEN CI before merge.

### Task 2: Russian-Language Robot
**Files:** `tests/test_russian_language_robot.py`, `scripts/russian_language_robot.py`, `.github/workflows/russian-language-robot.yml`
- [ ] RED: require source binding, Russian output, attorney review, and publishAllowed=false.
- [ ] GREEN: implement deterministic localization artifact without inventing legal authority.
- [ ] Add CI and verify GREEN.

### Task 3: Content Refresher
**Files:** `tests/test_content_refresher.py`, `scripts/content_refresher.py`, `.github/workflows/content-refresher.yml`
- [ ] RED: require source revision binding, material-change reasons, review-only proposals, and no direct site mutation.
- [ ] GREEN: implement deterministic refresh proposal artifact.
- [ ] Add CI and verify GREEN.

### Task 4: Orchestrator
**Files:** `tests/test_agent_orchestrator.py`, `scripts/agent_orchestrator.py`, `.github/workflows/agent-orchestrator.yml`
- [ ] RED: require agent routing, artifact identity/revision, approval gate, idempotent execution, and rejection of stale/rejected approvals.
- [ ] GREEN: implement routing and approval-aware execution contract.
- [ ] Add CI and verify GREEN.

### Task 5: End-to-End Approval Verification
**Files:** `tests/control-center/agent-e2e.test.mjs` plus existing Control Center approval modules as required.
- [ ] RED: model Control Center → agent → artifact → approval → execution.
- [ ] Verify pending artifact cannot execute.
- [ ] Verify rejected artifact cannot execute.
- [ ] Verify approved exact revision executes once.
- [ ] Verify stale or replayed approval cannot execute.
- [ ] Run full relevant test suite and PR CI.

### Task 6: Final Integration Review
- [ ] Review complete branch diff for accidental website/publication changes.
- [ ] Verify all agent workflows are read-only or approval-gated as designed.
- [ ] Verify exact-head CI results before any completion claim.
- [ ] Merge only after review and explicit merge authority where required.
