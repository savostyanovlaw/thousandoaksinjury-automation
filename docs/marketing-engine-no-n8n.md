# SLC Marketing Engine — n8n-free rollout plan

Status: proposal only; no workflows, publishing, ads, or API access enabled by this document.

## Mission
An internal single-client marketing agency for Savostyanov Law Corporation, focused on verified qualified California personal injury inquiries (goal: one per day). Operate scheduled monitoring and content-production tasks through GitHub Actions and Cloudflare, rather than adding n8n.

## Boundaries
- No external posts, messages, review requests, ad spend, site deploys, or account changes without attorney approval.
- Protect privileged/client data, API tokens, private strategy, and personal information; GitHub Actions secrets for credentials, never public source or logs.
- No fake testimonials, fabricated cases, false urgency, misleading claims or guarantees; attorney review for all public-facing legal content.
- Do not clone attorney voice/likeness without explicit consent.
- No n8n instance or workflows exist for this business. Do not plan an n8n migration or require n8n setup.
- ChatGPT hourly opportunity watch exists separately; it is not a substitute for execution jobs.

## Proposed components
1. GitHub Actions scheduled jobs for source collection, opportunity classification, and reporting; account for GitHub cron timing drift and rate limits.
2. Claude Code or deterministic scripts to generate drafts and prepare reviewable PRs, never silently merge or deploy.
3. HeyGen (or alternative, subject to credentials and costs) for EN/RU short video drafts; store assets securely, verify legal accuracy and subtitles.
4. YouTube Data API upload with explicit review/approval gate; Facebook/Instagram publishing only after verifying official APIs and permissions.
5. Cloudflare Pages/Workers for existing site and lightweight telemetry as necessary, respecting consent and privacy.
6. Conversion reporting separating impressions, GBP call clicks, website click-to-call, verified answered calls, qualified PI consultations, signed matters.

## First sprint acceptance criteria
- Inventory current repo Actions, existing publication integrations and secrets by name only. No n8n migration.
- Prepare a prioritized migration matrix with owners, risks, fallback and evidence that existing lead intake is not disrupted.
- Three pilot YouTube Shorts scripts (EN/RU variants), CTA to (818) 213-8798 and thousandoaksinjury.com, legal review checklist, metadata and storyboards; drafts only.
- Design a gated YouTube publishing workflow, no automatic posting until approval and OAuth access established.
- 14-day GSC comparison based on Oct 18 deployment; don't treat pre-deployment data as post-deployment impact.
- Draft dashboard definition and tests; avoid duplicating existing intake smoke.
- Open a separate PR for implementation; this plan alone is not a working engine.

## KPIs
Qualified PI calls/day; valid PI forms/day; consultations/week; signed PI cases/month. Secondary: channel-attributed landing visits, phone-click events, video impressions, retention, organic queries. Do not conflate click events with actual calls.

## YouTube Shorts audit — October 18, 2026
Source: owner's screenshot of https://www.youtube.com/@КалифорнийскийАдвокат/shorts. Snapshot only; unequal publication age, no retention or conversions data.

| Published Short (visible title) | Views at snapshot |
|---|---:|
| Русскоязычный адвокат в ... | 770 |
| Hit By An Uninsured Driver? You May Still ... | 208 |
| Insurance Companies Use THIS Against You ... | 108 |
| California Personal Injury Attorney ... | 17 |
| First Things To Do After a Car Accident In ... | 14 |
| Rearend In California | 8 |

Channel: Attorney in California; 11 subscribers, 8 videos, 6 Shorts in screenshot. Channel description currently mixes PI, trusts, business litigation, e-commerce and immigration. Do not claim this proves cause/effect; validate retention and inquiry attribution first.

### Editorial changes (approved direction; publishing integration not yet connected)
- Make new Shorts PI-first; use concrete problem-based hooks and bilingual English/Russian editions. Avoid repeating existing topics verbatim.
- Keep existing videos online; do not delete or overwrite without performance evidence.
- For each 30–50s video: 0–3s visual problem/hook; 3–15s cinematic illustrative B-roll; 15–35s the owner's verified HeyGen avatar; last 5–8s actionable takeaway and attorney CTA.
- Private avatar: HeyGen group dc82abf5827848daa3cedf4f4ba2cb76; approved look b36b721ada4c4c5fa161ab0934ef103b (blue blazer). Never substitute a generic presenter. Ensure attorney review, legal accuracy and disclosure of illustrative AI-generated scenes when appropriate.
- CTA: Savostyanov Law Corporation | Free consultation | (818) 213-8798 | thousandoaksinjury.com. No outcome guarantees or fabricated client stories.
- Publish only with authenticated YouTube access and track per-video traffic to a dedicated PI landing page, qualified calls and signed matters. No paid campaigns without a separate budget authorization.

### Next three DIFFERENT topics (draft concepts, not published)
1. English: 'The insurance adjuster called after your crash. What should you say?' Distinguish basic facts from speculation and premature settlement; do not instruct dishonesty or obstruction.
2. Russian: 'Попали в ДТП в Калифорнии? Почему не стоит сразу соглашаться на выплату' — direct Russian-language injury intake.
3. English: 'A delivery driver was hurt on the job. Who may be responsible?' — distinguish auto liability, workers compensation and other potential avenues; no categorical promises.

### Measurement gate
Capture publication date, 24h/7d views, impressions, viewed-vs-swiped, average percentage viewed, comments, site sessions with source attribution, actual qualified calls and signed cases. Do not optimize on raw views alone.
