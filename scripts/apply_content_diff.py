import re
from urllib.parse import urlparse

SITE_HOST = "thousandoaksinjury.com"
_SAFE_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*)*$")


def resolve_page_path(page_url, root="website"):
    """Map a real production page URL to its real repository file path.

    Mirrors the exact convention scripts/validate_site.py's REQUIRED_PAGES
    already encodes for every real page: <slug>/index.html under the site
    root, with the bare root itself mapping to index.html. Rejects anything
    that is not a plain lowercase slug (no "..", no absolute paths, no
    unexpected host) since page_url ultimately reaches this function through
    a GitHub Actions workflow_dispatch input.
    """
    raw = str(page_url or "").strip()
    if not raw:
        raise ValueError("page_url is required")
    parsed = urlparse(raw)
    if parsed.scheme:
        if parsed.hostname and parsed.hostname.lower() not in (SITE_HOST, f"www.{SITE_HOST}"):
            raise ValueError(f"unsupported page host: {parsed.hostname!r}")
        path = parsed.path
    else:
        path = raw
    slug = path.strip("/")
    if not slug:
        return f"{root}/index.html"
    if not _SAFE_SLUG.fullmatch(slug):
        raise ValueError(f"unsupported page path: {slug!r}")
    return f"{root}/{slug}/index.html"


def apply_diff(content, before, after):
    """Replace `before` with `after` in content, but only when `before`
    appears in the current content EXACTLY once.

    Refuses an ambiguous replacement rather than guessing: zero matches
    means the real page already changed since this diff was attorney-
    reviewed and approved (never safe to force through), and more than one
    match means the reviewed text is not specific enough to target a single
    real location.
    """
    before = str(before or "")
    after = str(after or "")
    if not before or not after or before == after:
        raise ValueError("before/after must both be non-empty and different")
    count = content.count(before)
    if count == 0:
        raise ValueError(
            "the reviewed text was not found in the current page; "
            "it may have changed since this diff was approved"
        )
    if count > 1:
        raise ValueError(
            f"the reviewed text matches {count} locations in the current page; "
            "refusing an ambiguous replacement"
        )
    return content.replace(before, after, 1)
