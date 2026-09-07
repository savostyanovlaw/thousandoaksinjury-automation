# Savostyanov Law Premium Website Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployment-ready premium redesign of `thousandoaksinjury.com` on the redesign branch while preserving existing SEO URLs/content, improving conversion and accessibility, and keeping production untouched until explicit approval.

**Architecture:** Keep the current static-first site architecture. Rebuild presentation with one shared premium CSS system and minimal vanilla JavaScript for navigation, motion, practice-area interaction, consent, and progressive enhancement. Preserve page-specific HTML/SEO content and structured data; do not introduce React/Next or any framework dependency.

**Tech Stack:** Static HTML5, modern CSS, vanilla JavaScript, Python 3 standard-library regression tooling, existing consent-gated GA4 implementation, local/approved image assets.

**Spec:** `docs/superpowers/specs/2026-09-06-premium-website-redesign-design.md`

## Global Constraints

- Work only on `redesign/premium-v2` or a child feature branch targeting it.
- Do not merge to `main`, deploy, alter DNS, or change production integrations without explicit user approval.
- Preserve these URLs: `/`, `/car-accident-lawyer/`, `/agoura-hills/`, `/camarillo/`, `/newbury-park/`, `/oak-park/`, `/simi-valley/`, `/westlake-village/`, `/ru/`.
- Use the real user-supplied attorney portrait for production; never substitute an AI-generated lookalike.
- Do not publish unverified results, ratings, testimonials, awards, success rates, client counts, or outcome guarantees.
- Do not advertise SMS/text contact until the phone number is confirmed SMS-capable.
- Do not use `No Fee Unless We Win` or equivalent wording unless the firm expressly approves that language; use accurate contingency-fee wording instead.
- Keep critical content and navigation crawlable without JavaScript.
- Preserve or improve canonical tags, titles, meta descriptions, Open Graph data, structured data, robots behavior, sitemap coverage, and internal links.
- Target WCAG 2.2 AA behavior, responsive layouts, and `prefers-reduced-motion` support.
- Keep analytics consent-gated; preserve GA4 ID `G-2QSCB196HW` behavior unless separately approved.
- A contact form cannot be declared launch-ready until a real submission endpoint/hosting mechanism is identified and tested. Repository inspection found no existing `<form>` implementation or form provider configuration, so this is an explicit external integration gate rather than something to guess.

---

## File Structure

### Shared presentation and behavior
- Modify: `website/assets/city-pages.css` — canonical premium design system for all pages, including header, hero, editorial sections, forms, footer, consent UI, responsive behavior, and reduced motion.
- Modify: `website/assets/city-pages.js` — accessible mobile menu, sticky-header state, practice-area interaction, subtle reveal behavior, consent-gated GA4, and form progressive-enhancement hooks.
- Modify: `website/assets/video-gallery.css` — adapt video cards to premium design system.
- Preserve/modify only as needed: `website/assets/video-gallery.js` — keep local thumbnails and `youtube-nocookie.com` click-to-load behavior.
- Leave `website/css/style.css`, `website/css/consent.css`, `website/js/main.js`, and `website/js/consent.js` unused unless a verified page still references them; remove references before considering deletion.

### Page HTML
- Modify: `website/index.html`
- Modify: `website/car-accident-lawyer/index.html`
- Modify: `website/agoura-hills/index.html`
- Modify: `website/camarillo/index.html`
- Modify: `website/newbury-park/index.html`
- Modify: `website/oak-park/index.html`
- Modify: `website/simi-valley/index.html`
- Modify: `website/westlake-village/index.html`
- Modify: `website/ru/index.html`
- Modify: `website/404.html`
- Modify only if URL set or timestamps legitimately change: `website/sitemap.xml`
- Preserve: `website/robots.txt`

### Images
- Add: `website/images/alexey-savostyanov-portrait.jpg` from the user-supplied real portrait, optimized for web while preserving visual quality.
- Add only approved/licensed local or decorative imagery. If no approved local photograph exists, use CSS composition/texture instead of invented location photography.

### Verification tooling
- Create: `scripts/validate_site.py`
- Create: `tests/test_validate_site.py`
- Create: `docs/redesign-qa.md` during final QA with evidence, not promises.

---

### Task 1: Build the SEO/content regression validator

**Files:**
- Create: `scripts/validate_site.py`
- Create: `tests/test_validate_site.py`

**Interfaces:**
- Produces: CLI `python3 scripts/validate_site.py --root website`
- Produces: exit code `0` when launch-critical static checks pass; non-zero with readable errors otherwise.
- Checks required URLs/files, one H1 per indexable page, canonical URLs, accidental `noindex`, parseable JSON-LD, visible phone/email on primary pages, internal-link targets, sitemap URL set, robots sitemap declaration, and banned/unverified marketing phrases.

- [ ] **Step 1: Write tests for validator helpers and failure cases**

Create `tests/test_validate_site.py` using `unittest` and temporary directories. Cover at minimum: missing canonical, duplicate H1, malformed JSON-LD, unresolved internal link, unexpected `noindex`, missing required sitemap URL, and banned copy such as `4.9/5` or `No Fee Unless We Win`.

- [ ] **Step 2: Run tests and verify they fail because validator code does not exist**

Run:
```bash
python3 -m unittest tests.test_validate_site -v
```
Expected: FAIL/ERROR importing `scripts.validate_site`.

- [ ] **Step 3: Implement `scripts/validate_site.py` with Python standard library only**

Use `html.parser.HTMLParser`, `json`, `xml.etree.ElementTree`, `pathlib`, and `urllib.parse`. Required page mapping:
```python
REQUIRED_PAGES = {
    "/": "index.html",
    "/car-accident-lawyer/": "car-accident-lawyer/index.html",
    "/agoura-hills/": "agoura-hills/index.html",
    "/camarillo/": "camarillo/index.html",
    "/newbury-park/": "newbury-park/index.html",
    "/oak-park/": "oak-park/index.html",
    "/simi-valley/": "simi-valley/index.html",
    "/westlake-village/": "westlake-village/index.html",
    "/ru/": "ru/index.html",
}
```
Banned launch copy must include case-insensitive checks for: `4.9/5`, `millions recovered`, `success rate`, `no fee unless we win`, `call or text anytime`, and any hard-coded star-rating claim unless later explicitly approved and removed from the banned set with a documented reason.

- [ ] **Step 4: Run unit tests and baseline validator**

Run:
```bash
python3 -m unittest tests.test_validate_site -v
python3 scripts/validate_site.py --root website
```
Expected: unit tests PASS. Baseline site validator may FAIL and should list current content/design regression items that subsequent tasks must clear.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_site.py tests/test_validate_site.py
git commit -m "test: add static site regression validator"
```

---

### Task 2: Replace the generic stylesheet with the premium design system

**Files:**
- Modify: `website/assets/city-pages.css`
- Modify: `website/assets/video-gallery.css`

**Interfaces:**
- Consumes existing class names where useful so pages can migrate incrementally.
- Produces shared tokens/classes for `.site-header`, `.brand-lockup`, `.nav-links`, `.hero`, `.hero-copy`, `.hero-portrait`, `.trust-strip`, `.practice-editorial`, `.cinematic-section`, `.process-steps`, `.attorney-editorial`, `.review-shell`, `.case-review`, `.mobile-action-bar`, `.site-footer`, `.reveal`.

- [ ] **Step 1: Add a temporary fixture page or use existing homepage to prove old CSS does not satisfy the approved selectors**

Run a grep before implementation:
```bash
grep -E "brand-lockup|practice-editorial|mobile-action-bar|attorney-editorial" website/assets/city-pages.css
```
Expected: no matches.

- [ ] **Step 2: Rewrite CSS tokens and layout system**

Use exact base tokens:
```css
:root {
  --ink: #111c30;
  --ink-deep: #091321;
  --ivory: #f7f3ec;
  --paper: #fffdf9;
  --white: #ffffff;
  --bronze: #a7824b;
  --bronze-dark: #7f6237;
  --muted: #5d6470;
  --line: rgba(17, 28, 48, .14);
  --display: Georgia, 'Times New Roman', serif;
  --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --content: 1240px;
  --text-measure: 720px;
}
```
Implement large editorial type, restrained bronze, ivory surfaces, high-contrast dark sections, 44px minimum touch targets on mobile, focus-visible styling, responsive breakpoints, and no rounded-pill-everywhere/card-heavy aesthetic.

- [ ] **Step 3: Consolidate duplicate cookie-consent CSS**

Keep one consent component implementation in `city-pages.css`; remove the duplicate `.cookie-banner` definitions while retaining current class compatibility.

- [ ] **Step 4: Add reduced-motion behavior**

```css
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
  .reveal { opacity: 1; transform: none; }
}
```

- [ ] **Step 5: Restyle video gallery without changing its privacy behavior**

Keep local thumbnails, click-to-load iframe, and 16:9 layout. Make cards editorial and consistent with the premium palette.

- [ ] **Step 6: Verify syntax/static checks**

Run:
```bash
python3 scripts/validate_site.py --root website
```
Expected: no new structural/SEO errors introduced by stylesheet work.

- [ ] **Step 7: Commit**

```bash
git add website/assets/city-pages.css website/assets/video-gallery.css
git commit -m "feat: add premium editorial design system"
```

---

### Task 3: Refactor shared JavaScript for accessible premium interaction

**Files:**
- Modify: `website/assets/city-pages.js`

**Interfaces:**
- Produces class-based mobile navigation using `[data-nav-toggle]`/`[data-nav-panel]` while keeping `.nav-toggle`/`.nav-links` fallback compatibility during migration.
- Produces `.is-scrolled` state on the header.
- Produces optional `[data-practice-trigger]` -> `[data-practice-image]` interaction without hiding link content.
- Produces `.is-visible` reveal state via `IntersectionObserver`, disabled under reduced motion.
- Preserves existing consent storage key `toi_cookie_consent` and GA4 ID `G-2QSCB196HW`.

- [ ] **Step 1: Capture current consent behavior in a code-level regression check**

Add assertions in `tests/test_validate_site.py` that the shared JS contains `toi_cookie_consent`, `G-2QSCB196HW`, and `youtube-nocookie.com` remains in `video-gallery.js`.

- [ ] **Step 2: Run tests**

```bash
python3 -m unittest tests.test_validate_site -v
```
Expected: PASS before refactor.

- [ ] **Step 3: Replace inline-style mobile menu logic with class/attribute state**

The toggle must update `aria-expanded`; menu closes on Escape, on a selected link, and when focus moves appropriately. Do not trap keyboard users in the header.

- [ ] **Step 4: Add sticky-header, practice-area, and reveal progressive enhancement**

All page content remains readable when JS is disabled. Hover interaction must have focus/click equivalent.

- [ ] **Step 5: Preserve and clean consent-gated analytics**

Do not load GA4 before analytics consent. Reject must retain cookie deletion/disable behavior. Do not add marketing scripts.

- [ ] **Step 6: Run regression tests and validator**

```bash
python3 -m unittest tests.test_validate_site -v
python3 scripts/validate_site.py --root website
```

- [ ] **Step 7: Commit**

```bash
git add website/assets/city-pages.js tests/test_validate_site.py
git commit -m "feat: add accessible premium site interactions"
```

---

### Task 4: Add and optimize the real attorney portrait

**Files:**
- Add: `website/images/alexey-savostyanov-portrait.jpg`
- Modify: relevant page image references as pages are rebuilt.

**Interfaces:**
- Source is the user-supplied real portrait from the approved conversation asset, not the generated mockup attorney.
- Output must be a web-optimized JPEG that remains visually faithful to the original.

- [ ] **Step 1: Copy the supplied portrait into the redesign workspace and optimize it**

Use an available image optimizer; if ImageMagick exists:
```bash
magick /path/to/user-supplied/portrait.jpg -auto-orient -strip -resize '1600x1600>' -quality 88 website/images/alexey-savostyanov-portrait.jpg
```
If `magick` is unavailable, use Python/Pillow only if already installed; do not substitute an AI image.

- [ ] **Step 2: Verify dimensions/file size and inspect visually**

```bash
file website/images/alexey-savostyanov-portrait.jpg
ls -lh website/images/alexey-savostyanov-portrait.jpg
```
Check face, suit, skin tones, crop, and proportions against the supplied original.

- [ ] **Step 3: Commit**

```bash
git add website/images/alexey-savostyanov-portrait.jpg
git commit -m "assets: add approved attorney portrait"
```

---

### Task 5: Rebuild the homepage to match the approved mockup direction

**Files:**
- Modify: `website/index.html`

**Interfaces:**
- Preserve existing title, canonical, core schema entities, FAQ content where accurate, and existing SEO sections/content by reorganizing rather than deleting useful information.
- Use real portrait path `/images/alexey-savostyanov-portrait.jpg`.
- Keep visible `tel:+18182138798` and `mailto:attorney@savostyanovlaw.com`.

- [ ] **Step 1: Save a baseline of current SEO-critical homepage facts**

Record in the implementation notes: current title, canonical, H1, structured-data entity IDs, internal local-page links, FAQ questions, phone, email, and video section IDs.

- [ ] **Step 2: Rebuild header and hero**

Required visible copy:
- Brand: `THOUSAND OAKS INJURY` / `SAVOSTYANOV LAW`
- Eyebrow: `INJURED IN THOUSAND OAKS?`
- H1: `Thousand Oaks Personal Injury Lawyer`
- Positioning: `Serious representation. Direct access to your attorney.`
- CTA: `FREE CASE REVIEW`
- Phone: `(818) 213-8798`
- Email: `attorney@savostyanovlaw.com`
- Location signal: `Westlake Village, California`

Do not add Results or Reviews navigation links unless verified content is supplied. Do not include a Text CTA yet.

- [ ] **Step 3: Add premium trust strip and interactive practice-area section**

Trust strip: California Bar #363457, USC Gould School of Law, Direct Attorney Access, English · Русский, Free Consultation.

Practice links must include `/car-accident-lawyer/`; other practice areas may remain section anchors until dedicated URLs exist. Do not invent URLs.

- [ ] **Step 4: Add dark local statement, three-step process, attorney editorial, educational video, local-area links, FAQ, and final contact section**

Use `Local Representation. Personal Attention.` rather than an unverified results claim. Keep meaningful long-form SEO copy below/within editorial sections, not as a wall of text.

- [ ] **Step 5: Add final case-review form markup in integration-safe mode**

Until Task 10 identifies and validates a real submission endpoint, render the form fields and button with JavaScript-disabled submission blocked using `action=""` and a visible direct-contact fallback; mark the implementation with `data-form-integration="pending"`. This is acceptable only on the redesign branch and MUST cause the validator/deployment gate to fail until Task 10 replaces it with a tested endpoint. Do not deploy this intermediate state.

- [ ] **Step 6: Add correct EN/RU hreflang pair**

Homepage:
```html
<link rel="alternate" hreflang="en" href="https://thousandoaksinjury.com/">
<link rel="alternate" hreflang="ru" href="https://thousandoaksinjury.com/ru/">
<link rel="alternate" hreflang="x-default" href="https://thousandoaksinjury.com/">
```

- [ ] **Step 7: Run validator**

```bash
python3 scripts/validate_site.py --root website
```
Expected: homepage structural/SEO checks pass; form integration gate remains explicitly failing until Task 10.

- [ ] **Step 8: Serve locally and inspect desktop/mobile**

```bash
python3 -m http.server 8080 --directory website
```
Inspect at 1440px, 1024px, 768px, 390px, and 360px widths. Verify email is visible, no horizontal overflow, portrait crop is correct, mobile CTA does not obscure content, and nav is keyboard-operable.

- [ ] **Step 9: Commit**

```bash
git add website/index.html
git commit -m "feat: rebuild premium homepage"
```

---

### Task 6: Rebuild the car-accident landing page

**Files:**
- Modify: `website/car-accident-lawyer/index.html`

**Interfaces:**
- Preserve canonical `/car-accident-lawyer/`, H1 intent, LegalService/Person/WebPage/Breadcrumb/FAQ schema, and substantive unique car-accident content.
- Adopt the shared premium header, trust strip, attorney section, final contact block, and mobile actions.

- [ ] **Step 1: Preserve all accurate current FAQ/schema facts and SEO metadata**

Do not weaken the existing Thousand Oaks car-accident keyword intent.

- [ ] **Step 2: Reorganize into the approved practice-area template**

Order: localized hero -> trust -> common crash types -> what to do -> insurance -> fault/damages -> UM/UIM/deadlines/evidence -> why Savostyanov Law -> attorney -> areas served -> FAQ -> case review.

- [ ] **Step 3: Remove unsupported or overbroad legal statements during editorial review**

Keep general educational caveats and avoid promises.

- [ ] **Step 4: Run validator and local visual inspection**

```bash
python3 scripts/validate_site.py --root website
```
Inspect desktop and mobile alongside homepage to ensure consistent design language.

- [ ] **Step 5: Commit**

```bash
git add website/car-accident-lawyer/index.html
git commit -m "feat: redesign car accident landing page"
```

---

### Task 7: Apply the premium system to every local landing page without cloning content

**Files:**
- Modify: `website/agoura-hills/index.html`
- Modify: `website/camarillo/index.html`
- Modify: `website/newbury-park/index.html`
- Modify: `website/oak-park/index.html`
- Modify: `website/simi-valley/index.html`
- Modify: `website/westlake-village/index.html`

**Interfaces:**
- Each page keeps its current canonical, city-specific title/H1/local content/FAQ/schema.
- Each page adopts shared header/footer/trust/contact structure and real portrait.

- [ ] **Step 1: Update one representative page (`newbury-park`) first**

Convert hero, trust strip, local editorial sections, cards, FAQ, CTA, and footer to the premium components without flattening unique local content.

- [ ] **Step 2: Validate and visually review Newbury Park before propagating layout**

```bash
python3 scripts/validate_site.py --root website
```
Check 390px and 1440px layouts.

- [ ] **Step 3: Apply the same component structure to Agoura Hills, Camarillo, Oak Park, Simi Valley, and Westlake Village**

Do not copy city paragraphs between pages. Preserve genuine locality differences.

- [ ] **Step 4: Remove unsafe marketing/content claims across city pages**

Replace any `No Fee Unless We Recover Compensation` badge with `Contingency Fee Representation` plus accurate explanatory wording. Remove `Call or text anytime` unless SMS capability is later verified. Remove unsupported claims about adjuster practices or local procedural advantage that cannot be substantiated; replace with neutral localized facts.

- [ ] **Step 5: Run full validator**

```bash
python3 scripts/validate_site.py --root website
```
Expected: no banned-copy, canonical, H1, JSON-LD, internal-link, robots, or sitemap failures except the intentional form integration gate.

- [ ] **Step 6: Commit**

```bash
git add website/agoura-hills/index.html website/camarillo/index.html website/newbury-park/index.html website/oak-park/index.html website/simi-valley/index.html website/westlake-village/index.html
git commit -m "feat: redesign local personal injury pages"
```

---

### Task 8: Rewrite the Russian experience as genuinely Russian

**Files:**
- Modify: `website/ru/index.html`

**Interfaces:**
- `lang="ru"` remains.
- Canonical remains `https://thousandoaksinjury.com/ru/`.
- Add reciprocal hreflang with homepage.
- Navigation, CTAs, labels, form states, accessibility text, FAQ, and core copy are Russian except proper names/recognized English degree names.

- [ ] **Step 1: Remove current hybrid Russian/English phrases**

Eliminate examples such as `Thousand Oaks Personal Injury & ДТП Attorney`, English hero prose, `Not a Call Center`, and English FAQ answers.

- [ ] **Step 2: Rebuild with the same premium hierarchy as English homepage**

Keep natural Russian legal-marketing language, direct attorney positioning, phone, visible email, Westlake Village location, and English-version link.

- [ ] **Step 3: Add hreflang**

```html
<link rel="alternate" hreflang="en" href="https://thousandoaksinjury.com/">
<link rel="alternate" hreflang="ru" href="https://thousandoaksinjury.com/ru/">
<link rel="alternate" hreflang="x-default" href="https://thousandoaksinjury.com/">
```

- [ ] **Step 4: Run validator and native-language review**

```bash
python3 scripts/validate_site.py --root website
```
Then perform a human Russian-language pass for fluency, not word-for-word translation.

- [ ] **Step 5: Commit**

```bash
git add website/ru/index.html
git commit -m "feat: rebuild Russian language experience"
```

---

### Task 9: Redesign 404, footer consistency, metadata/schema, and sitemap regression

**Files:**
- Modify: `website/404.html`
- Modify: `website/sitemap.xml` only for legitimate `lastmod` updates after page edits.
- Modify page metadata/schema only where validator or review identifies inconsistencies.

**Interfaces:**
- 404 stays `noindex, follow`.
- All indexable URLs stay indexable.
- `website/robots.txt` stays functionally unchanged.

- [ ] **Step 1: Bring 404 into premium design system**

Keep useful area links, phone/email, and return-home CTA.

- [ ] **Step 2: Audit every page for metadata/schema consistency**

Verify canonical URL, title, meta description, OG URL/title/description/image, JSON-LD parseability, firm phone/email/address, and no unsupported schema claims.

- [ ] **Step 3: Update sitemap lastmod only for pages actually changed**

Do not add invented URLs or remove existing URLs.

- [ ] **Step 4: Run full regression suite**

```bash
python3 -m unittest tests.test_validate_site -v
python3 scripts/validate_site.py --root website
```

- [ ] **Step 5: Commit**

```bash
git add website/404.html website/sitemap.xml website/**/*.html
git commit -m "fix: complete SEO and global page regression pass"
```

---

### Task 10: Resolve the contact-form integration gate safely

**Files:**
- Modify: `website/index.html`
- Modify: practice/local/Russian pages if they contain forms.
- Modify: `website/assets/city-pages.js` only if endpoint behavior needs progressive enhancement.
- Modify: `scripts/validate_site.py` to require the approved live/staging form configuration and remove the intentional `data-form-integration="pending"` failure.

**Interfaces:**
- Produces a tested lead submission path with success and error states.
- Must not expose secrets in client HTML/JS.

- [ ] **Step 1: Identify the real hosting/form mechanism before writing integration code**

Repository search found no existing form endpoint/provider/deployment config. Determine the actual host and supported secure submission mechanism from the deployment environment. Do not choose a provider by assumption and do not put API secrets in the browser.

- [ ] **Step 2: Implement the approved mechanism in staging/test configuration**

Required fields: full name, phone, email, brief case description. Include accessible labels, required validation, honeypot or host-supported spam mitigation, privacy/no-attorney-client disclaimer, deterministic success message, and deterministic error message.

- [ ] **Step 3: Test successful and failed submissions end-to-end**

Use non-client test data only. Confirm the test message is actually received by the intended destination. Force a failed request and confirm the visitor sees a useful retry/direct-contact path rather than silent failure.

- [ ] **Step 4: Remove the pending integration marker and make validator enforce form readiness**

```bash
python3 scripts/validate_site.py --root website
```
Expected: form gate passes.

- [ ] **Step 5: Commit**

```bash
git add website scripts/validate_site.py
git commit -m "feat: integrate and verify case review form"
```

---

### Task 11: Final functional, responsive, accessibility, privacy, and performance QA

**Files:**
- Create: `docs/redesign-qa.md`
- Modify site files only for defects found during QA.

**Interfaces:**
- Produces documented evidence required before the branch is called deployment-ready.

- [ ] **Step 1: Run all automated checks fresh**

```bash
python3 -m unittest tests.test_validate_site -v
python3 scripts/validate_site.py --root website
```
Expected: all PASS, zero launch-blocking errors.

- [ ] **Step 2: Serve the exact branch locally**

```bash
python3 -m http.server 8080 --directory website
```

- [ ] **Step 3: Manual browser matrix**

Review homepage, car-accident page, Newbury Park, Agoura Hills, Russian page, and 404 at 360, 390, 768, 1024, and 1440 widths. Check header/menu, bottom mobile action bar, phone/email links, focus order, accordions, video, forms, long text, portrait crops, no overlap/overflow, and reduced-motion mode.

- [ ] **Step 4: Browser compatibility**

Test Chrome/Chromium, Firefox, and Safari/WebKit-equivalent where available. Record browser/version and any limitation in `docs/redesign-qa.md`.

- [ ] **Step 5: Performance/Lighthouse**

If Lighthouse CLI is available, run:
```bash
lighthouse http://127.0.0.1:8080/ --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./docs/lighthouse-home.json --chrome-flags='--headless'
lighthouse http://127.0.0.1:8080/car-accident-lawyer/ --only-categories=performance,accessibility,best-practices,seo --output=json --output-path=./docs/lighthouse-car.json --chrome-flags='--headless'
```
If the executor environment does not have Lighthouse, do not invent scores; run equivalent browser DevTools Lighthouse before deployment approval and document the actual results.

- [ ] **Step 6: Consent/privacy verification**

In a clean browser profile: reject analytics and confirm GA script/cookies are not loaded; accept analytics and confirm GA loads only afterward. Verify YouTube does not contact YouTube/Google until Play is clicked.

- [ ] **Step 7: Content/legal advertising review**

Search final files for prohibited/unverified claims:
```bash
grep -RniE "4\.9/5|millions recovered|success rate|no fee unless we win|call or text anytime" website || true
```
Expected: no unapproved matches.

- [ ] **Step 8: Write `docs/redesign-qa.md` with actual evidence**

Include commands/results, pages/viewports tested, form test result, consent test result, Lighthouse results or explicit pending environment limitation, and a list of any known non-blocking issues.

- [ ] **Step 9: Re-run verification after every QA fix**

```bash
python3 -m unittest tests.test_validate_site -v
python3 scripts/validate_site.py --root website
```
Expected: PASS after the final change.

- [ ] **Step 10: Commit QA evidence**

```bash
git add website scripts tests docs/redesign-qa.md docs/lighthouse-*.json
git commit -m "test: complete redesign launch QA"
```
Only add Lighthouse JSON files if they were actually generated.

---

### Task 12: Prepare review PR without deployment

**Files:**
- No production files changed in this task unless review finds a defect.

**Interfaces:**
- Produces a draft PR for human review.
- Must not merge or deploy.

- [ ] **Step 1: Run final verification immediately before PR**

```bash
python3 -m unittest tests.test_validate_site -v
python3 scripts/validate_site.py --root website
```
Expected: all PASS.

- [ ] **Step 2: Review diff against the approved design spec**

Confirm every spec section maps to implemented behavior and no production URL was removed.

- [ ] **Step 3: Create a draft PR**

If implementation occurred on a child branch, target `redesign/premium-v2`. If `redesign/premium-v2` itself contains the complete build and the user wants a final pre-production review, a draft PR may target `main`, explicitly labeled **DO NOT MERGE / DO NOT DEPLOY**.

PR body must include:
- screenshots/preview instructions;
- changed-page list;
- SEO URL preservation statement;
- automated test output;
- form integration test evidence;
- accessibility/browser QA summary;
- performance evidence;
- known limitations;
- explicit note that production is untouched.

- [ ] **Step 4: Stop for user approval**

Do not merge, deploy, alter DNS, or change production configuration. Final deployment is a separate explicitly approved action.
