# AGENTS.md — read this before acting in this repository

This file is the shared operating contract for every AI agent working on
thousandoaksinjury.com: ChatGPT automations, Claude sessions, and GitHub
Actions agents. No agent can talk to another directly. This repository is the
only shared memory, so every rule below is something you can check by reading
GitHub before you act.

## North star

At least one **qualified personal injury intake** per business day, then more
signed cases. Impressions, clicks, call taps, GA4 events, published pages and
merged PRs are activity, never intakes. Report them separately.

## Before you create anything

1. Read this file.
2. Read the open PR list. If 5 or more agent PRs are open, do not open another;
   comment on the `opportunities` issue instead.
3. Read the last 14 days of `ops/change-log.md`. Do not edit a page whose
   release date is less than 28 days old, except to fix a bug, a broken link,
   a factual error, or a compliance problem.
4. Search the pinned `opportunities` issue for the same page or query.

## Lanes (one owner each)

A non-owner may propose into a lane (comment on `opportunities`) but may not act in it.

| Lane | Owner | Output | Cadence |
| --- | --- | --- | --- |
| Opportunity intake (channels, demand signals) | ChatGPT: SLC PI Acquisition Watch | One comment per finding on `opportunities` | Daily digest |
| Search data (GSC query × page) | ChatGPT: GSC PI Opportunity Watch | Data comment on `scorecard` | Weekly |
| Site content and SEO changes | ChatGPT: Daily PI Intake Improvement | At most 1 PR per week, label `agent:chatgpt` | Weekly |
| Measurement, daily brief, weekly scorecard | Claude | Private report to owner | Daily / weekly |
| Paid and local channels (LSA, Google Ads, GBP) | Claude | Analysis and proposed changes | Weekly |
| Release management | Claude | Review, compliance check, weekly release PR, change log | Weekly |
| Referral development | Claude | Prospect list and outreach drafts | As needed |
| Technical SEO, intake smoke, fleet health | GitHub Actions | Issues, pass/fail | Scheduled |
| Opportunity Finder, Local SEO, Link Builder, Competitor Monitor, Video Engine, CTR Optimizer | GitHub Actions | Proposals into the control-center approval queue | Scheduled |
| Client Acquisition CEO | GitHub Actions | Paused until a real data file feeds it | Manual |

## Lifecycle of a change

1. Finding → comment on `opportunities` (page, query or hypothesis, evidence).
2. Lane owner opens or extends one PR naming the page, the hypothesis, and the
   metric that would show success.
3. Claude reviews for accuracy, California Rule 7.1 compliance, and overlap.
4. Approved PRs ship in one release PR per week where practical.
5. After merge, the release date for each changed page goes in `ops/change-log.md`.
6. That page is frozen for 28 days (see "Before you create anything").

## Standing rules

- **Say who you are.** Every issue, comment and PR starts with the automation
  name and carries one label: `agent:chatgpt`, `agent:claude` or `agent:actions`.
- **Mark evidence.** Every claim is Verified (source and date), Reported (from
  the owner or a screenshot) or Hypothesis.
- **One source of truth.** Status and numbers go on the pinned `scorecard`
  issue, not new issues.
- **PR only.** Never push to `main`. Never deploy outside the Cloudflare
  Pages build from `main`.
- **The repo is public.** Never commit lead names, phone numbers, case facts,
  client information, spend figures, lead counts or credentials. Those stay in
  the owner's private scorecard.

## California attorney advertising (non-negotiable)

- No guarantees, predictions, case results, settlement figures or
  testimonials unless the owner supplied them and they are verifiable.
- No "specialist", "expert" or "certified" claims; no comparative superiority
  ("best", "top", "#1") that cannot be factually substantiated.
- Every page keeps the "Attorney Advertising" notice and the responsible
  attorney's name.
- Never imply an attorney-client relationship from a website visit or form.
- No solicitation of specific injured people, no paid referrals, no fee
  sharing with non-lawyers, no fake reviews, no purchased links.
- Legal statements (deadlines, statutes) cite the statute and are checked
  against the current code before release.
- Anything with an ethics question goes to the owner before release.

## Spending and outside contact

No agent increases ad spend, creates paid campaigns, sends outreach,
requests reviews or contacts any third party without the owner's explicit
approval of that action.
