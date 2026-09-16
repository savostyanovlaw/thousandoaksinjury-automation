# Money Funnel Internal Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the three primary PI money funnels by routing relevant city-page users and internal authority to Car Accident, Dog Bite, and Slip-and-Fall pages while preserving a direct case-review conversion path.

**Architecture:** Keep the existing city-page template and shared conversion form. Add a consistent practice-area section to each of the six established local pages, with contextual links to all three money pages and a direct Free Case Review link. Protect the structure with regression tests rather than creating new thin location pages.

**Tech Stack:** Static HTML, Python unittest/pytest-compatible tests, existing Cloudflare Pages site structure.

**Spec:** Approved in chat on 2026-09-16.

## Global Constraints

- Do not change `main` directly; work on `seo/money-funnel-internal-links`.
- Do not create new city pages in this change.
- Preserve existing canonical URLs, single H1, phone/email CTAs, and working shared case-review integration.
- Avoid unsupported results, rankings, guarantees, specialist claims, or new fee promises.
- Use TDD: failing regression test before production HTML changes.

---

### Task 1: Protect the funnel contract

**Files:**
- Modify: `tests/test_local_pages.py`

**Interfaces:**
- Consumes: the six `LOCAL_PAGES` already enumerated by the test suite.
- Produces: regression requirements for `/car-accident-lawyer/`, `/dog-bite-lawyer/`, `/slip-and-fall-lawyer/`, and `#contact` on every local page.

- [ ] Add a failing test requiring all three primary money-page links on every local page.
- [ ] Require the local page to retain its direct `#contact` conversion path.
- [ ] Commit the RED test.

### Task 2: Add contextual practice-area routing

**Files:**
- Modify: `website/agoura-hills/index.html`
- Modify: `website/camarillo/index.html`
- Modify: `website/newbury-park/index.html`
- Modify: `website/oak-park/index.html`
- Modify: `website/simi-valley/index.html`
- Modify: `website/westlake-village/index.html`

**Interfaces:**
- Consumes: existing local-page section/card styles.
- Produces: a visible `Practice Areas` section linking to all three money funnels plus the existing case-review anchor.

- [ ] Add a concise practice-area section to each page using existing CSS classes.
- [ ] Keep wording location-aware but avoid duplicating large blocks of SEO copy.
- [ ] Run the regression suite and confirm GREEN.
- [ ] Commit implementation.

### Task 3: PR validation

**Files:**
- No production files beyond Tasks 1–2.

- [ ] Open a draft PR against `main`.
- [ ] Run PR-triggered Premium Redesign Validation.
- [ ] Review diff for accidental copy, canonical, form, or navigation regressions.
- [ ] Resolve failures before marking Ready for Review.
