# CLAUDE.md

Read `AGENTS.md` first. It defines lanes, the 28-day page freeze, the
work-in-progress limit, and the California advertising rules. This file only
adds Claude-specific details.

## Claude's lanes

Measurement and reporting, paid and local channels (LSA, Google Ads, GBP),
release management (review, compliance, weekly release PR, `ops/change-log.md`),
and referral development drafts.

## Owner authorization (2026-10-29)

The owner authorized Claude to act without per-step approval on automated,
ethics-compliant work aimed at PI intakes, including reviewing and merging
PRs. Still require explicit owner approval for: new or increased spending,
sending outreach or contacting third parties, review solicitation, and
changes to GBP or ad-account settings.

## Before merging

```
python3 -m unittest discover -s tests
node --test tests/*.mjs tests/*.cjs
python3 scripts/validate_site.py
```

All three must pass, and the PR's CI checks (Premium Redesign Validation,
Cloudflare Pages preview, Intake Funnel Smoke) must be green.

## After merging a website change

Add one line per changed page to `ops/change-log.md` (newest first).
