#!/usr/bin/env python3
from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
from html.parser import HTMLParser
import json
import os
import subprocess
import sys
import time
import re
from collections import Counter
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

# This module is invoked both as a script (python scripts/technical_seo_watchdog.py,
# which puts scripts/ itself on sys.path, not the repo root) and as a package
# member (python -m unittest tests.test_technical_seo_watchdog, from the repo
# root). Ensure the repo root is importable either way before reaching into
# another sibling module.
_REPO_ROOT = str(Path(__file__).resolve().parent.parent)
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from scripts.opportunity_finder import CITY_LABELS, PRACTICE_AREA_TOPICS

PRODUCTION_BASE_URL = "https://thousandoaksinjury.com"
PRODUCTION_HOST = "thousandoaksinjury.com"
MONITORED_ROUTES = (
    "/",
    "/agoura-hills/",
    "/westlake-village/",
    "/oak-park/",
    "/newbury-park/",
    "/camarillo/",
    "/simi-valley/",
    "/ru/",
)
SITEMAP_SAMPLE_LIMIT = 12
USER_AGENT = "TechnicalSEO-Watchdog/1.0 (+https://thousandoaksinjury.com)"


@dataclasses.dataclass(frozen=True)
class Failure:
    fingerprint: str
    title: str
    check: str
    url: str
    evidence: str
    recommended_fix: str
    # Populated only for check == "content_stale": the real data Content
    # Refresher needs to produce an actual reviewable draft, never a
    # placeholder. Empty for every other check.
    source_revision: str = ""
    page_title: str = ""
    page_body: str = ""
    material_change_reason: str = ""


@dataclasses.dataclass(frozen=True)
class RobotsInfo:
    global_disallow: bool
    sitemaps: tuple[str, ...]


@dataclasses.dataclass(frozen=True)
class HtmlInfo:
    canonicals: list[str]
    noindex: bool
    has_tel: bool
    has_mailto: bool
    title: str = ""
    meta_description: str = ""
    internal_links: list[str] = dataclasses.field(default_factory=list)
    body_text: str = ""


@dataclasses.dataclass(frozen=True)
class FetchResult:
    url: str
    final_url: str
    status: int
    headers: dict[str, str]
    text: str


class _HtmlInspector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.canonicals: list[str] = []
        self.noindex = False
        self.has_tel = False
        self.has_mailto = False
        self.title = ""
        self.meta_description = ""
        self.internal_links: list[str] = []
        self.body_text_parts: list[str] = []
        self._in_title = False
        self._title_buf: list[str] = []
        self._skip_text_tag: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = {str(k).lower(): (v or "") for k, v in attrs}
        tag = tag.lower()
        if tag in ("script", "style"):
            self._skip_text_tag = tag
        if tag == "title":
            self._in_title = True
            self._title_buf = []
        elif tag == "link":
            rel_tokens = {token.lower() for token in attrs_dict.get("rel", "").split()}
            if "canonical" in rel_tokens and attrs_dict.get("href"):
                self.canonicals.append(attrs_dict["href"].strip())
        elif tag == "meta":
            name = attrs_dict.get("name", "").strip().lower()
            content = attrs_dict.get("content", "").lower()
            if name == "description":
                self.meta_description = attrs_dict.get("content", "").strip()
            if attrs_dict.get("type", "").lower() == "application/ld+json":
                self._capture, self._buffer = "jsonld", []
            if name in {"robots", "googlebot"} and "noindex" in {t.strip() for t in content.replace(";", ",").split(",")}:
                self.noindex = True
        elif tag == "a":
            href_raw = attrs_dict.get("href", "").strip()
            href = href_raw.lower()
            if href.startswith("tel:"):
                self.has_tel = True
            elif href.startswith("mailto:"):
                self.has_mailto = True
            if href_raw:
                self.internal_links.append(href_raw)

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_buf.append(data)
        elif not self._skip_text_tag:
            text = data.strip()
            if text:
                self.body_text_parts.append(text)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag == "title" and self._in_title:
            self.title = "".join(self._title_buf).strip()
            self._in_title = False
        if tag == self._skip_text_tag:
            self._skip_text_tag = None


def normalize_path(path: str) -> str:
    if not path:
        return "/"
    parsed = urllib.parse.urlsplit(path)
    raw = parsed.path or "/"
    if not raw.startswith("/"):
        raw = "/" + raw
    if raw != "/" and not raw.endswith("/"):
        raw += "/"
    return raw


def parse_robots(text: str) -> RobotsInfo:
    global_disallow = False
    sitemaps: list[str] = []
    current_agents: list[str] = []
    block_is_global = False

    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if key == "user-agent":
            agent = value.lower()
            if current_agents and not all(a == agent for a in current_agents):
                current_agents = []
            current_agents.append(agent)
            block_is_global = "*" in current_agents
        elif key == "disallow" and block_is_global and value == "/":
            global_disallow = True
        elif key == "sitemap" and value:
            sitemaps.append(value)

    return RobotsInfo(global_disallow=global_disallow, sitemaps=tuple(sitemaps))


def parse_sitemap(xml_text: str) -> list[str]:
    root = ET.fromstring(xml_text)
    urls: list[str] = []
    for elem in root.iter():
        if elem.tag.rsplit("}", 1)[-1] == "loc" and elem.text:
            urls.append(elem.text.strip())
    return urls


def inspect_html(html_text: str) -> HtmlInfo:
    parser = _HtmlInspector()
    parser.feed(html_text)
    return HtmlInfo(
        canonicals=parser.canonicals,
        noindex=parser.noindex,
        has_tel=parser.has_tel,
        has_mailto=parser.has_mailto,
        title=parser.title,
        meta_description=parser.meta_description,
        internal_links=parser.internal_links,
        body_text=" ".join(parser.body_text_parts),
    )


def classify_case_review_get(status: int) -> str | None:
    if status == 404 or status >= 500:
        return f"case-review GET returned HTTP {status}"
    return None


def make_failure(check: str, route: str, evidence: str, recommended_fix: str) -> Failure:
    route_id = normalize_path(route) if route.startswith("/") else route
    fingerprint = f"watchdog:{check}:{route_id}"
    title = f"[Technical SEO Watchdog] {check}: {route_id}"
    url = urllib.parse.urljoin(PRODUCTION_BASE_URL + "/", route.lstrip("/")) if route.startswith("/") else route
    return Failure(
        fingerprint=fingerprint,
        title=title,
        check=check,
        url=url,
        evidence=evidence,
        recommended_fix=recommended_fix,
    )


def _decode_body(body: bytes, headers: dict[str, str]) -> str:
    content_type = headers.get("content-type", "")
    charset = "utf-8"
    if "charset=" in content_type.lower():
        charset = content_type.lower().split("charset=", 1)[1].split(";", 1)[0].strip() or "utf-8"
    try:
        return body.decode(charset, errors="replace")
    except LookupError:
        return body.decode("utf-8", errors="replace")


def fetch_url(url: str, timeout: int = 10, retries: int = 1) -> FetchResult:
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                headers = {k.lower(): v for k, v in response.headers.items()}
                body = response.read()
                result = FetchResult(
                    url=url,
                    final_url=response.geturl(),
                    status=int(response.status),
                    headers=headers,
                    text=_decode_body(body, headers),
                )
                if result.status >= 500 and attempt < retries:
                    time.sleep(0.5)
                    continue
                return result
        except urllib.error.HTTPError as exc:
            headers = {k.lower(): v for k, v in exc.headers.items()} if exc.headers else {}
            body = exc.read() if hasattr(exc, "read") else b""
            result = FetchResult(
                url=url,
                final_url=exc.geturl() or url,
                status=int(exc.code),
                headers=headers,
                text=_decode_body(body, headers),
            )
            if result.status >= 500 and attempt < retries:
                time.sleep(0.5)
                continue
            return result
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(0.5)
                continue
            raise RuntimeError(f"request failed for {url}: {exc}") from exc
    raise RuntimeError(f"request failed for {url}: {last_error}")


def _canonical_failure(route: str, canonical: str | None, count: int) -> Failure | None:
    expected_path = normalize_path(route)
    if count != 1:
        return make_failure(
            "canonical",
            route,
            f"expected exactly 1 canonical, found {count}",
            "Ensure the page outputs exactly one canonical link pointing to its production URL.",
        )
    parsed = urllib.parse.urlsplit(canonical or "")
    actual_path = normalize_path(parsed.path)
    if parsed.scheme.lower() != "https" or parsed.hostname != PRODUCTION_HOST or actual_path != expected_path:
        return make_failure(
            "canonical",
            route,
            f"canonical={canonical!r}; expected=https://{PRODUCTION_HOST}{expected_path}",
            "Set the canonical to the HTTPS thousandoaksinjury.com URL for this route.",
        )
    return None


def _check_html_route(route: str, result: FetchResult, require_contacts: bool = False) -> list[Failure]:
    failures: list[Failure] = []
    expected_path = normalize_path(route)
    final = urllib.parse.urlsplit(result.final_url)
    if result.status != 200:
        failures.append(make_failure("route", route, f"HTTP {result.status}", "Restore the route so it returns HTTP 200."))
        return failures
    if final.scheme.lower() != "https" or final.hostname != PRODUCTION_HOST or normalize_path(final.path) != expected_path:
        failures.append(
            make_failure(
                "route",
                route,
                f"unexpected final URL {result.final_url}",
                "Remove the unexpected redirect and keep the indexed route on the production HTTPS host.",
            )
        )
    info = inspect_html(result.text)
    canonical_failure = _canonical_failure(route, info.canonicals[0] if info.canonicals else None, len(info.canonicals))
    if canonical_failure:
        failures.append(canonical_failure)
    x_robots = result.headers.get("x-robots-tag", "").lower()
    if info.noindex or "noindex" in x_robots:
        failures.append(
            make_failure(
                "noindex",
                route,
                f"meta_noindex={info.noindex}; x-robots-tag={result.headers.get('x-robots-tag', '')!r}",
                "Remove accidental noindex directives from this production indexable page.",
            )
        )
    if require_contacts:
        if not info.has_tel:
            failures.append(make_failure("contact-tel", route, "homepage has no tel: link", "Restore a working tel: link on the homepage."))
        if not info.has_mailto:
            failures.append(make_failure("contact-email", route, "homepage has no mailto: link", "Restore a working mailto: link on the homepage."))
    return failures


def run_checks(base_url: str = PRODUCTION_BASE_URL) -> list[Failure]:
    base_url = base_url.rstrip("/")
    failures: list[Failure] = []

    for route in MONITORED_ROUTES:
        url = base_url + route
        try:
            result = fetch_url(url)
        except RuntimeError as exc:
            failures.append(make_failure("route", route, str(exc), "Restore network reachability for this production route."))
            continue
        failures.extend(_check_html_route(route, result, require_contacts=(route == "/")))

    robots_url = base_url + "/robots.txt"
    try:
        robots_result = fetch_url(robots_url)
        if robots_result.status != 200:
            failures.append(make_failure("robots", "/robots.txt", f"HTTP {robots_result.status}", "Restore robots.txt with HTTP 200."))
        else:
            robots = parse_robots(robots_result.text)
            if robots.global_disallow:
                failures.append(make_failure("robots", "/robots.txt", "User-agent: * is blocked by Disallow: /", "Remove the global crawl block from production robots.txt."))
            expected_sitemap = base_url + "/sitemap.xml"
            if expected_sitemap not in robots.sitemaps:
                failures.append(make_failure("robots-sitemap", "/robots.txt", f"sitemaps={list(robots.sitemaps)!r}", f"Reference {expected_sitemap} from robots.txt."))
    except RuntimeError as exc:
        failures.append(make_failure("robots", "/robots.txt", str(exc), "Restore robots.txt reachability."))

    sitemap_urls: list[str] = []
    sitemap_url = base_url + "/sitemap.xml"
    try:
        sitemap_result = fetch_url(sitemap_url)
        if sitemap_result.status != 200:
            failures.append(make_failure("sitemap", "/sitemap.xml", f"HTTP {sitemap_result.status}", "Restore sitemap.xml with HTTP 200."))
        else:
            try:
                sitemap_urls = parse_sitemap(sitemap_result.text)
            except ET.ParseError as exc:
                failures.append(make_failure("sitemap", "/sitemap.xml", f"invalid XML: {exc}", "Publish a valid XML sitemap."))
                sitemap_urls = []
            if not sitemap_urls:
                failures.append(make_failure("sitemap", "/sitemap.xml", "sitemap contains no URLs", "Publish at least the production homepage and indexable routes in sitemap.xml."))
            homepage = base_url + "/"
            if sitemap_urls and homepage not in sitemap_urls:
                failures.append(make_failure("sitemap-homepage", "/sitemap.xml", f"homepage {homepage} missing", "Add the canonical production homepage to sitemap.xml."))
            bad_hosts = [u for u in sitemap_urls if urllib.parse.urlsplit(u).scheme != "https" or urllib.parse.urlsplit(u).hostname != PRODUCTION_HOST]
            if bad_hosts:
                failures.append(make_failure("sitemap-host", "/sitemap.xml", f"non-production URLs: {bad_hosts[:5]!r}", "Keep sitemap URLs on https://thousandoaksinjury.com only."))
    except RuntimeError as exc:
        failures.append(make_failure("sitemap", "/sitemap.xml", str(exc), "Restore sitemap.xml reachability."))

    monitored_set = {base_url + route for route in MONITORED_ROUTES}
    extra_sample = [u for u in sitemap_urls if u not in monitored_set][:SITEMAP_SAMPLE_LIMIT]
    for url in extra_sample:
        parsed = urllib.parse.urlsplit(url)
        if parsed.hostname != PRODUCTION_HOST or parsed.scheme != "https":
            continue
        route = parsed.path or "/"
        try:
            result = fetch_url(url)
        except RuntimeError as exc:
            failures.append(make_failure("sitemap-sample", route, str(exc), "Restore the sitemap-listed URL or remove it from sitemap.xml."))
            continue
        failures.extend(_check_html_route(route, result))

    # Crawl every sitemap URL for broken indexable pages and collect duplicate metadata.
    titles: dict[str, list[str]] = {}
    descriptions: dict[str, list[str]] = {}
    for url in sitemap_urls:
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or parsed.hostname != PRODUCTION_HOST:
            continue
        route = parsed.path or "/"
        try:
            result = fetch_url(url)
        except RuntimeError as exc:
            failures.append(make_failure("sitemap-url", route, str(exc), "Restore the URL or remove it from sitemap.xml."))
            continue
        if result.status != 200:
            failures.append(make_failure("sitemap-url", route, f"HTTP {result.status}", "Restore the URL or remove it from sitemap.xml."))
            continue
        info = inspect_html(result.text)
        if info.title:
            titles.setdefault(info.title.casefold(), []).append(route)
        if info.meta_description:
            descriptions.setdefault(info.meta_description.casefold(), []).append(route)
        # Validate same-site links found on crawled pages.
        for href in info.internal_links:
            absolute = urllib.parse.urljoin(result.final_url, href)
            p = urllib.parse.urlsplit(absolute)
            if p.hostname != PRODUCTION_HOST or p.scheme not in {"http","https"}:
                continue
            if p.path.startswith("/cdn-cgi/"):
                # Cloudflare edge-managed paths (e.g. the email-obfuscation
                # decode link /cdn-cgi/l/email-protection) are not part of
                # this site's own content and are not something a fix here
                # can change; a direct GET without the client-side decode
                # script/fragment routinely 404s even though the real
                # mailto: link it replaces works normally for visitors.
                continue
            try:
                linked = fetch_url(absolute, timeout=7, retries=0)
                if linked.status >= 400:
                    failures.append(make_failure("broken-link", route, f"{absolute} -> HTTP {linked.status}", "Fix or remove the broken internal link."))
            except RuntimeError:
                failures.append(make_failure("broken-link", route, f"{absolute} unreachable", "Fix or remove the unreachable internal link."))
    for value, routes in titles.items():
        if len(routes) > 1:
            failures.append(make_failure("duplicate-title", routes[0], f"same title on {routes[:8]!r}", "Give indexable pages unique descriptive titles."))
    for value, routes in descriptions.items():
        if len(routes) > 1:
            failures.append(make_failure("duplicate-description", routes[0], f"same description on {routes[:8]!r}", "Give indexable pages unique meta descriptions."))

    endpoint_url = base_url + "/api/case-review"
    try:
        endpoint = fetch_url(endpoint_url)
        endpoint_error = classify_case_review_get(endpoint.status)
        final = urllib.parse.urlsplit(endpoint.final_url)
        if endpoint_error:
            failures.append(make_failure("case-review-endpoint", "/api/case-review", endpoint_error, "Restore the Cloudflare Pages Function and verify its production runtime configuration."))
        elif final.scheme.lower() != "https" or final.hostname != PRODUCTION_HOST or final.path.rstrip("/") != "/api/case-review":
            failures.append(make_failure("case-review-endpoint", "/api/case-review", f"unexpected final URL {endpoint.final_url}", "Restore the /api/case-review route without redirecting it away from the production function."))
    except RuntimeError as exc:
        failures.append(make_failure("case-review-endpoint", "/api/case-review", str(exc), "Restore the Cloudflare Pages Function reachability."))

    unique: dict[str, Failure] = {}
    for failure in failures:
        unique[failure.fingerprint] = failure
    return list(unique.values())


CONTENT_STALENESS_MAX_AGE_DAYS = 270


def _real_content_pages() -> list[tuple[str, str, str, str]]:
    """(route, source file, real topic, real city) for every real, currently
    published page this repository serves -- the same practice-area/city
    vocabulary Opportunity Finder already uses for real Content Creator
    handoffs, so a refresh proposal describes the same real subject matter
    a human reviewer already recognizes from the rest of the fleet."""
    pages = [("/", "website/index.html", "personal injury", "Thousand Oaks")]
    for slug, topic in PRACTICE_AREA_TOPICS.items():
        pages.append((f"/{slug}/", f"website/{slug}/index.html", topic, "Thousand Oaks"))
    for slug, city in CITY_LABELS.items():
        pages.append((f"/{slug}/", f"website/{slug}/index.html", "personal injury", city))
    return pages


def git_last_commit(repo_root: str, relative_path: str) -> tuple[str, dt.datetime] | None:
    """The real, verifiable (sha, commit-date) of the last commit that
    touched this file -- never a fabricated or assumed staleness signal."""
    try:
        result = subprocess.run(
            ["git", "log", "-1", "--format=%H%x1f%cI", "--", relative_path],
            cwd=repo_root, capture_output=True, text=True, timeout=10, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    line = result.stdout.strip()
    if not line or "\x1f" not in line:
        return None
    sha, _, date_str = line.partition("\x1f")
    try:
        return sha, dt.datetime.fromisoformat(date_str)
    except ValueError:
        return None


def check_content_staleness(
    base_url: str = PRODUCTION_BASE_URL,
    repo_root: str = ".",
    now: dt.datetime | None = None,
    max_age_days: int = CONTENT_STALENESS_MAX_AGE_DAYS,
    commit_lookup=None,
    page_fetch=None,
) -> list[Failure]:
    """Real, evidence-based staleness signal for Content Refresher: a page's
    own git history, not a blind schedule or a fabricated placeholder. A
    page whose real source file has not been committed to in max_age_days is
    a legitimate, material reason to propose a refresh; a page edited last
    week never is, no matter how long this watchdog has been running.

    Only reaches out to the live site for pages that already cleared the
    staleness bar (usually none), to capture the real current title/body the
    refresh draft is built from -- never for every page on every run.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    lookup = commit_lookup or (lambda path: git_last_commit(repo_root, path))
    fetch = page_fetch or (lambda url: inspect_html(fetch_url(url).text))
    base = base_url.rstrip("/")
    findings: list[Failure] = []
    for route, file_path, topic, city in _real_content_pages():
        commit = lookup(file_path)
        if commit is None:
            # No real git history to check against -- never assume staleness.
            continue
        sha, commit_date = commit
        age_days = (now - commit_date).days
        if age_days < max_age_days:
            continue
        url = base + route
        try:
            info = fetch(url)
        except RuntimeError as exc:
            findings.append(make_failure(
                "content-stale-unreachable", route, str(exc),
                "Restore the page's reachability before a refresh can be prepared.",
            ))
            continue
        reason = (
            f"No substantive update in {age_days} days (source last changed "
            f"{commit_date.date().isoformat()}); threshold {max_age_days} days."
        )
        findings.append(Failure(
            fingerprint=f"watchdog:content_stale:{normalize_path(route)}",
            title=f"[Technical SEO Watchdog] content_stale: {normalize_path(route)}",
            check="content_stale",
            url=url,
            evidence=reason,
            recommended_fix=f"Have Content Refresher propose an updated draft for this {topic} page in {city}; owner review required before any change is applied.",
            source_revision=sha,
            page_title=info.title or f"{city} {topic.title()} Lawyer",
            page_body=(info.body_text or "")[:9000],
            material_change_reason=reason,
        ))
    return findings


def _utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_report(path: str, base_url: str, failures: list[Failure]) -> None:
    payload = {
        "base_url": base_url.rstrip("/"),
        "checked_at": _utc_now_iso(),
        "healthy": not failures,
        "failures": [dataclasses.asdict(f) for f in failures],
    }
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check live Thousand Oaks Injury technical SEO health.")
    parser.add_argument("--base-url", default=PRODUCTION_BASE_URL)
    parser.add_argument("--output", default="artifacts/technical-seo-watchdog/report.json")
    parser.add_argument("--repo-root", default=".", help="Local checkout root for the git-history content-staleness check")
    parser.add_argument("--skip-content-staleness", action="store_true", help="Skip the git-history content-staleness check (used in environments without real git history, e.g. shallow test fixtures)")
    args = parser.parse_args()
    # A detected SEO/content finding is the watchdog's intended product, not an
    # operational failure of the watchdog itself: it must not turn the GitHub
    # Actions run red, or every legitimate finding would be misread by fleet
    # health monitoring (and the Control Center) as "the agent is broken."
    # Producing the report successfully is what "healthy agent run" means
    # here; an uncaught exception below still fails the process normally.
    failures = run_checks(args.base_url)
    if not args.skip_content_staleness:
        failures = failures + check_content_staleness(args.base_url, args.repo_root)
    write_report(args.output, args.base_url, failures)
    if failures:
        for failure in failures:
            print(f"FAIL {failure.fingerprint}: {failure.evidence}")
        print(f"Technical SEO Watchdog: {len(failures)} finding(s) reported for owner review")
    else:
        print("Technical SEO Watchdog: healthy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
