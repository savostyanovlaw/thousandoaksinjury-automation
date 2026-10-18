# SLC Marketing Engine — n8n-free rollout plan

Status: proposal only; no workflows, publishing, ads, or API access enabled by this document.

## Mission
An internal single-client marketing agency for Savostyanov Law Corporation, focused on verified qualified California personal injury inquiries (goal: one per day). Operate scheduled monitoring and content-production tasks through GitHub Actions and Cloudflare, rather than adding n8n.

## Boundaries
- No external posts, messages, review requests, ad spend, site deploys, or account changes without attorney approval.
- Protect privileged/client data, API tokens, private strategy, and personal information; GitHub Actions secrets for credentials, never public source or logs.
- No fake testimonials, fabricated cases, false urgency, misleading claims or guarantees; attorney review for all public-facing legal content.
- Do not clone attorney voice/likeness without explicit consent.
- Existing n8n workflows remain intact until each is inventoried, replacement is tested, and cutover is authorized.
- ChatGPT hourly opportunity watch exists separately; it is not a substitute for execution jobs.

## Proposed components
1. GitHub Actions scheduled jobs for source collection, opportunity classification, and reporting; account for GitHub cron timing drift and rate limits.
2. Claude Code or deterministic scripts to generate drafts and prepare reviewable PRs, never silently merge or deploy.
3. HeyGen (or alternative, subject to credentials and costs) for EN/RU short video drafts; store assets securely, verify legal accuracy and subtitles.
4. YouTube Data API upload with explicit review/approval gate; Facebook/Instagram publishing only after verifying official APIs and permissions.
5. Cloudflare Pages/Workers for existing site and lightweight telemetry as necessary, respecting consent and privacy.
6. Conversion reporting separating impressions, GBP call clicks, website click-to-call, verified answered calls, qualified PI consultations, signed matters.

## First sprint acceptance criteria
- Inventory current repo Actions, n8n-dependent tasks, publication integrations and secrets by name only.
- Prepare a prioritized migration matrix with owners, risks, fallback and evidence that existing lead intake is not disrupted.
- Three pilot YouTube Shorts scripts (EN/RU variants), CTA to (818) 213-8798 and thousandoaksinjury.com, legal review checklist, metadata and storyboards; drafts only.
- Design a gated YouTube publishing workflow, no automatic posting until approval and OAuth access established.
- 14-day GSC comparison based on Oct 18 deployment; don't treat pre-deployment data as post-deployment impact.
- Draft dashboard definition and tests; avoid duplicating existing intake smoke.
- Open a separate PR for implementation; this plan alone is not a working engine.

## KPIs
Qualified PI calls/day; valid PI forms/day; consultations/week; signed PI cases/month. Secondary: channel-attributed landing visits, phone-click events, video impressions, retention, organic queries. Do not conflate click events with actual calls.
