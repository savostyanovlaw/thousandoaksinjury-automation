# PI client acquisition audit and 14-day plan (issue #160)

Branch `claude/pi-acquisition-160`, 2026-10-17. Nothing was merged, deployed, published, or changed in Google, Cloudflare or any directory. No third party was contacted.

Labels: **V** = verified this session (source given) · **I** = inference · **B** = blocked by account access.

## 1. Search Console query × page (B)

- **B** This session has no Search Console access (no connector, no repo secret). Fresh 28-day vs prior-28-day numbers were **not** pulled. The issue's Sep 15–Oct 14 figures (25 clicks / 4,783 impressions / 0.52% CTR; "business lawyer" 502 impr / 0 clicks; "car accident lawyer thousand oaks" 5 impr, pos ~25.6; "car accident attorney thousand oaks" 26 impr, pos ~57.5) are historical and are not re-reported as current.
- Added `scripts/gsc_query_page_audit.py`, which produces the exact report the issue asks for: totals, intent groups (local and all), and query × landing page, with impression-weighted position for both periods, "business lawyer" broken out, and a reminder that impressions are not visits. Owner, one command:

  ```bash
  gcloud auth application-default login \
    --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
  GSC_ACCESS_TOKEN=$(gcloud auth application-default print-access-token) \
    python3 scripts/gsc_query_page_audit.py --site sc-domain:thousandoaksinjury.com --out docs/seo/gsc-audit.md
  ```
  (For a URL-prefix property use `--site https://thousandoaksinjury.com/`.) No credentials are stored. Without the CLI: GSC → Performance → filter Query contains `business lawyer` → **Pages** tab, and repeat for `car accident`, `personal injury`, `dog bite` with "Compare: last 28 days vs previous period".

## 2. What the public sees (V)

| Check | Result | Source |
| --- | --- | --- |
| Production HTML is current | **Fresh on all 7 key pages**: plain URL = cache-busted URL; `cf-cache-status: DYNAMIC`, `cache-control: public, max-age=0, must-revalidate` | `scripts/cache_freshness_probe.mjs` in CI, PR #161 smoke run annotations |
| Old "Online submission will be enabled…" text in search results | Not on the live site. It is Google's stored snapshot from before PR #159 and refreshes on recrawl. Speed it up with GSC URL Inspection → Request indexing for `/newbury-park/`, `/westlake-village/`, `/agoura-hills/`, `/oak-park/`, `/simi-valley/`, `/camarillo/`, `/ru/` | Search results still show pre-#159 titles ("…Attorney") |
| `www.thousandoaksinjury.com` | **HTTP 522** (Cloudflare can't reach an origin for `www`). Any link, ad or typed `www` visit is a dead end | Probe annotation, 2026-10-17 |
| Production intake | Post-deploy smoke on `main` (fc62e5d) passed: health reports delivery key bound, empty POST → 400 from the live function, browser wiring on 4 pages. Runs daily at 15:17 UTC | `Intake Funnel Smoke` workflow |

### NAP consistency

| Source | Name | Address | Phone | Website | Note |
| --- | --- | --- | --- | --- | --- |
| Issue #160 / firm records | Savostyanov Law Corporation | 2629 Townsgate Rd **Suite 235**, Westlake Village CA 91361 | (818) 213-8798 | — | canonical |
| thousandoaksinjury.com (before this PR) | same | 2629 Townsgate Rd (**no suite**) on 17 pages and 14 schema blocks | same | — | **Mismatch, fixed in this PR** |
| [lawyerscalif.com listing](https://lawyerscalif.com/lawyers/savostyanov-law-corporation/) | same | 2629 Townsgate Rd. (no suite) | 8182138798 | savostyanovlaw.com | Categories: Business & Corporate, Consumer, Contract, Employment, Immigration, IP, Real Estate, Wills & Trusts. **No personal-injury category** |
| Google Business Profile | **B**: dashboard not accessible; no public profile found by web search | | | | Owner must check (section 5) |

**I** Why "business lawyer" shows up: the visible directory listing above labels the firm only with business/general categories and links to savostyanovlaw.com. #155 recorded that the GBP description led with business work. Both point Google's entity understanding away from PI. Confirm it in GSC (Query = "business lawyer" → Pages). Not changed: the site's `sameAs` to savostyanovlaw.com is accurate (same firm).

## 3. Changes in this PR (evidence → change)

| Evidence | Change | Files |
| --- | --- | --- |
| Site address lacks "Suite 235" vs the canonical NAP | Suite added to every visible address, schema `streetAddress` and the FAQ answer | 17 HTML files |
| "car accident attorney thousand oaks" got 26 impressions at pos ~57.5, more demand than the "lawyer" variant (5 impr), and the phrase appeared **0** times on `/car-accident-lawyer/` | Used **once** in the meta description and once in the lede. Title, H1 and URL unchanged; no stuffing (test asserts exactly one body use) | `car-accident-lawyer/index.html` |
| No repeatable way to get query × page data | `scripts/gsc_query_page_audit.py` + tests | new |
| Stale-HTML and www-host status were unproven | `scripts/cache_freshness_probe.mjs`, run read-only against production on every smoke run (per-page cache headers + www status as annotations) | new, workflow |

Not changed, on purpose: no new city pages (seven already exist and get 9+ internal links each); dog-bite and city titles (no query data justifies a change); consent model; tracking IDs.

## 4. Analytics (code verified; account steps B)

Shipped in #159 and unchanged: GA4 `G-2QSCB196HW`, opt-in consent only. Events `phone_click` / `email_click` (with `cta_location`), `form_start`, `generate_lead` (server-confirmed), `form_submit_error` (code only), each with `landing_page`. Allow-listed parameters; no PII (tests in `tests/lead-events.test.cjs`).

**B** Owner, in GA4 (Admin → Data display → Events): mark `generate_lead` and `phone_click` as **key events**. Then Admin → DebugView: open the site on a phone, Accept cookies, tap Call (cancel the dialer) and confirm `phone_click` arrives. GA4 counts only consenting visitors, so treat it as a lower bound.

**Controlled form test (proposed, not run):** Actions → *Intake Funnel Smoke* → Run workflow, check `send_test_lead`. It sends exactly one email titled "TEST LEAD - automated funnel check". Confirm it arrives at attorney@savostyanovlaw.com, then delete it.

## 5. Account-only steps (exact)

1. **Cloudflare: fix www 522** (dashboard access + your OK):
   1. DNS → find the `www` record. A 522 means it points at an origin that doesn't answer (typically an old A record). Replace it with `CNAME www → thousandoaksinjury.pages.dev`, Proxied.
   2. Workers & Pages → `thousandoaksinjury` → Custom domains → add `www.thousandoaksinjury.com`.
   3. Rules → Redirect Rules → Create: *When* `http.host eq "www.thousandoaksinjury.com"` → *Dynamic* `concat("https://thousandoaksinjury.com", http.request.uri.path)`, status **301**, **Preserve query string** on.
   4. Verify: the probe step in *Intake Funnel Smoke* should annotate `WWW OK … 301 -> https://thousandoaksinjury.com/newbury-park/?probe=1`.
2. **Google Business Profile** (owner only):
   - Primary category **Personal injury attorney**; remove or demote general/business categories if PI is the goal for this profile.
   - Address exactly `2629 Townsgate Rd Suite 235, Westlake Village, CA 91361`; phone `(818) 213-8798`; website `https://thousandoaksinjury.com/` (or `/westlake-village/`).
   - Description leads with personal injury; add services: Car accidents, Dog bites, Motorcycle accidents, Slip and fall, Wrongful death. Languages: English, Russian.
   - Paste the profile's map URL into a follow-up so `hasMap` can go into the schema.
3. **Search Console**: run the section 1 command; Request indexing for the 7 city pages and `/car-accident-lawyer/`; check Query = "business lawyer" → Pages.
4. **Directories** (your decision; no outreach was done): correct lawyerscalif.com (suite, PI category, PI website) and any other listing with a different suite, website or category set. State Bar profile address should match too.

## 6. 14-day qualified-lead plan

A *qualified PI lead* = a person injured in an accident with a potential third-party claim, within the limitations period, not already represented, reachable. Not qualified: vendors, solicitations, non-PI matters, spam.

| Days | Channel | Action | Who | Cost |
| --- | --- | --- | --- | --- |
| 1–2 | Measurement | Mark GA4 key events; run the controlled test lead; run the GSC audit script; start the scorecard below | Owner (accounts) | $0 |
| 1–3 | Local | Fix www 522; GBP category, NAP and services per section 5 | Owner | $0 |
| 1–3 | Organic | Merge this PR after review; request indexing for 8 URLs | Owner | $0 |
| 3–7 | Local | Ask **past PI clients you actually represented** for honest Google reviews (no incentives, no scripts that put words in their mouths; California Rules of Prof. Conduct 7.1–7.3) | Owner | $0 |
| 3–7 | Directories | Correct existing listings first (NAP + PI category) before adding new ones | Owner | $0 |
| 7 | Review | Read the GSC audit: which PI query × page pairs gained impressions/position. Only then pick page work (e.g. a Thousand Oaks car-crash section on `/` if `/` ranks for car queries) | Claude + owner | $0 |
| 8–14 | Organic | One evidence-backed content improvement per week on the page Google already ranks for the query, with attorney review | Claude + owner | $0 |
| any | **Paid (needs approval)** | Google Local Services Ads (pay-per-lead, "Google Screened") are typically the most direct paid PI channel; Search Ads on exact local PI terms second. Budget, screening and disputes are your decision; nothing set up | Owner | budget TBD |

No outcome is promised. At 25 organic clicks a month, the website alone is unlikely to produce one qualified inquiry a day within 14 days. GBP/local and (if approved) LSA are the levers with the shortest feedback loop.

### Weekly scorecard (fill from sources; never estimate)

| Week of | Qualified calls (carrier log + intake notes) | Valid forms (inbox, excl. TEST/spam) | Consultations held | Signed PI clients | Organic PI query clicks (GSC, PI groups) | GBP actions (calls / website / directions) | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-10-19 | | | | | | | baseline |
| 2026-10-26 | | | | | | | |

Never count a `phone_click` or a GSC impression as a lead.

## Rollback

Revert the PR merge. Address text, one meta description, one lede sentence, two scripts, one workflow step, tests.
