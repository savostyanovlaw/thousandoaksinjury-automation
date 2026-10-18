# PI intake funnel: how it works, how it is tested, how to read it

Issue #158 (builds on #148, #155, #157, #12, #10). Updated 2026-10-17.

## Paths a visitor can take

| Path | How it works | Proof it works |
| --- | --- | --- |
| Tap to call | Every indexed page has one phone target, `tel:+18182138798`, in the header/hero, the contact block, the footer and a sticky mobile bar that shows the number | `tests/test_intake_funnel.py`, `scripts/intake_e2e.mjs` (bar inside the first 390×844 viewport, ≥ 44 px tall) |
| Case-review form, JavaScript on | `assets/city-pages.js` validates, sends to `/api/case-review`, shows success or a call/email fallback inline; double clicks send once | `scripts/intake_e2e.mjs` on all 13 form pages |
| Case-review form, JavaScript off or blocked | The form now POSTs natively (`action="/api/case-review" method="post"`); the function answers with a 303 to `/thank-you/` or `/case-review-error/` | `scripts/intake_e2e.mjs` (no-JS runs on `/newbury-park/`, `/westlake-village/`, `/ru/`) |
| Email | `mailto:attorney@savostyanovlaw.com` on every page | static tests |

Required fields: name, phone, short description. **Email is optional** (it used to be required; phone-only leads are common in PI).

## What the firm receives

`functions/api/case-review.js` emails `attorney@savostyanovlaw.com` via Resend:

- Subject: `New Free Case Review — <name> (<page path>)`, so the landing page is visible in the inbox list.
- Body: name, phone, email or "Not provided", language, page, time, description, then a **Lead attribution** block (first landing page, external referrer, `utm_*`, `gclid`, or `Direct / unknown`). Attribution is kept in the visitor's `sessionStorage` for that tab only and sent only with the form.
- Spam handling: the honeypot silently drops bots. Submissions filled in under 2.5 s or with 3+ links are **delivered** with `[Possible spam]` in the subject, never discarded.

Function logs (Cloudflare → Pages → thousandoaksinjury → Functions → Logs) record `case_review_delivered`, `case_review_rejected`, `case_review_delivery_failed` (with the Resend HTTP status and error name) and `case_review_unavailable`. No names, phones, emails or descriptions are logged.

`GET /api/intake-health` returns `{"delivery_configured": true}` (200) when `RESEND_API_KEY` is bound to that deployment, and 503 otherwise. It never sends email.

## Analytics (GA4 `G-2QSCB196HW`, opt-in consent only)

| Event | When | Parameters (no personal data) |
| --- | --- | --- |
| `phone_click` | tap on any `tel:` link | `cta_location` (sticky_bar, header, hero, contact, footer, page), `landing_page` |
| `email_click` | tap on any `mailto:` link | `cta_location`, `landing_page` |
| `form_start` | first focus in the form | `form_id` |
| `generate_lead` | the server confirmed delivery | `form_id`, `form_language`, `landing_page` |
| `form_submit_error` | browser validation, server validation, delivery or network failure | `form_id`, `error_code` |

`page_location` / `page_path` are sent without query strings. Parameters are allow-listed in `assets/lead-events.js`; anything else is dropped.

**GA4 counts only visitors who click Accept.** Treat every GA4 number as a lower bound.

## Funnel scorecard (fill weekly; never estimate)

| Stage | Source of truth | Note |
| --- | --- | --- |
| Organic impressions / clicks / queries | Search Console → Performance | Filter the six target queries below |
| Sessions by landing page | GA4 → Reports → Landing page | Consenting visitors only |
| Call taps (`phone_click`) | GA4 events | A tap, **not** a call |
| Form starts / submissions / failures | GA4 `form_start`, `generate_lead`, `form_submit_error` | Consenting visitors only |
| **Form leads received** | Inbox: subject starts `New Free Case Review` | Authoritative count; exclude `TEST`/`[Possible spam]` after review |
| **Inbound calls** | Phone carrier call log for (818) 213-8798 | Not tracked by the website |
| Qualified PI leads | Attorney intake decision | Manual |
| Signed clients | Engagement agreements | Manual |

Never report a call tap or a GA4 event as an intake.

Target queries: personal injury lawyer Thousand Oaks · personal injury attorney Thousand Oaks · car accident lawyer Thousand Oaks · dog bite lawyer Thousand Oaks · personal injury lawyer Westlake Village · personal injury lawyer Newbury Park.

## Testing

| Command | What it proves | Sends email? |
| --- | --- | --- |
| `python3 -m unittest discover -s tests` | page contracts, SEO tags, tracking contract | no |
| `node --test tests/*.mjs tests/*.cjs` | endpoint validation, attribution, redirects, logs, health | no (fetch mocked) |
| `node scripts/intake_e2e.mjs` | browser → real function code → captured email, every form page, JS and no-JS, failure fallback, analytics, sticky call bar | no (in-memory mailbox) |
| `SITE_URL=<deployed url> node scripts/deployed_intake_smoke.mjs` | a deployed preview or production: pages, health, function live (empty POST → 400), browser wiring (intercepted) | no |
| same with `SEND_TEST_LEAD=1` | one labeled synthetic lead through the live endpoint | **one** |

CI: `Premium Redesign Validation` runs the first three on every PR. `Intake Funnel Smoke (deployed)` runs the deployed smoke on the Cloudflare branch preview for every PR, on production after each push to `main`, and daily on production. Run it manually (Actions → Intake Funnel Smoke → Run workflow) with **send_test_lead** checked to send one labeled test lead.

## Rollback

Revert the merge commit on `main`; Cloudflare Pages redeploys the previous build. No URLs, canonicals or hreflang pairs were removed. Titles changed on `/`, `/westlake-village/`, `/newbury-park/` (Attorney → Lawyer; H1s still say Attorney).
