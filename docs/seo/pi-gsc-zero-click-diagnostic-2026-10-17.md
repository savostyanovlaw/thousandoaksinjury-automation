# PI organic acquisition — Search Console diagnostic (17 October 2026)

## Data and scope
Connected Google Search Console through Windsor.ai, **1–14 October 2026**, 1,022 daily query × landing-page records. Aggregate metrics below were computed from the returned rows; average position is impression-weighted. This is an **organic web search** diagnostic, not Google Maps/GBP or actual lead volume. Search Console may suppress some low-volume queries; do not treat these rows as all site traffic.

PI query classification includes personal injury, car/auto accident, motorcycle, dog bite, slip and fall, wrongful death, pedestrian, truck accident and injury lawyer/attorney. **615 PI-query impressions, 0 organic clicks (0% observed CTR)**. Separate non-PI sample (business lawyer, intellectual property lawyer, contract lawyer): **989 impressions, 0 clicks**. Retain genuine non-PI services.

| Query | Impressions | Clicks | Average position |
| --- | ---: | ---: | ---: |
| personal injury lawyer thousand oaks | 47 | 0 | 12.4 |
| thousand oaks personal injury attorney | 48 | 0 | 15.1 |
| thousand oaks personal injury attorneys | 18 | 0 | 9.2 |
| car accident lawyer thousand oaks | 40 | 0 | 50.7 |
| car accident attorney thousand oaks | 14 | 0 | 67.7 |
| russian personal injury attorney in sherman oaks | 17 | 0 | 7.2 |
| agoura hills car accident lawyer | 18 | 0 | 25.7 |
| simi valley personal injury lawyer | 16 | 0 | 80.4 |

## Diagnosis
1. **Ranking/discovery is the primary visible bottleneck**: the car accident page has average positions ~51–68 for its most important exact-match terms; rewriting button text cannot overcome being buried in results.
2. The homepage is closer to page one for some PI queries (~9–15). There is not enough click volume to claim a statistically meaningful CTR-copy defect. Check actual SERP presentation and indexing before changing title tags.
3. The site already has a substantive `/car-accident-lawyer/` page with California-wide areaServed structured data, Thousand Oaks local intent, direct-attorney copy, free case review and phone CTA. Do **not** create a second overlapping doorway page.
4. The site already has GA4 `phone_click` and `generate_lead` code (consent-dependent), Resend-backed intake and daily deployed smoke tests. **Do not mistake configured tracking for independently verified conversions.**

## Implementation plan, in priority order
- **P0 / owner-side verification:** GSC URL Inspection for `/`, `/car-accident-lawyer/`, `/dog-bite-lawyer/` and `/ru/`: indexing status, Google-selected canonical, last crawl, rendered page, sitemap inclusion. Record findings. Only request indexing if URL is eligible and not indexed.
- **P0 / intake:** compare inbound call records, missed calls, Resend intake emails and qualified leads. Test GA4 events through consent-approved DebugView; do not send unlabeled fake leads.
- **P1 / page relevance:** inspect live Google results for `car accident lawyer thousand oaks`, assess whether title/snippet is displayed as intended, review internal anchor text from homepage and city pages, confirm no accidental noindex/canonical/redirect. Prioritize unique local evidence and client questions over keyword stuffing.
- **P1 / distribution:** add genuinely useful California car-accident videos and context links to existing pages; preserve EN/RU and statewide scope. Any new media needs attorney review and approval before publication.
- **P1 / GBP:** public primary category is Personal injury attorney; car-accident Update post is published and public Maps shows Call now. Check that all new PI service edits are approved. Monitor weekly phone *clicks* separately from answered calls and qualified cases.
- **P2 / experiment:** after fixes, compare equivalent 28-day windows by exact query × page, impressions, weighted position, clicks, and actual qualified intakes. Note that category/GBP edits and www redirect occurred 17 October, so October 1–14 is **pre-change** baseline.

## Definition of done
A verified diagnosis for each high-intent URL; tracked lead sources; a dated 28-day before/after comparison; an actual qualified-PI-intake count and signed-client count. Goal: >=1 qualified PI inquiry/day. Never report clicks or impressions as leads.

## Related
Issue #162. Existing intake implementation: `docs/intake-funnel.md`. Existing GSC audit utility: `scripts/gsc_query_page_audit.py`.
