#!/usr/bin/env python3
from __future__ import annotations

import dataclasses

from scripts import technical_seo_watchdog as core

_CORE_INSPECT_HTML = core.inspect_html


def inspect_html(html_text: str) -> core.HtmlInfo:
    """Inspect production HTML while accepting Cloudflare email protection.

    Cloudflare Email Address Obfuscation rewrites normal mailto: anchors to
    /cdn-cgi/l/email-protection in the HTML served at the edge. That is still a
    functioning email contact and must not be reported as a missing email link.
    """
    info = _CORE_INSPECT_HTML(html_text)
    if info.has_mailto:
        return info

    lowered = html_text.lower()
    if "/cdn-cgi/l/email-protection" in lowered:
        return dataclasses.replace(info, has_mailto=True)
    return info


def main() -> int:
    core.inspect_html = inspect_html
    return core.main()


if __name__ == "__main__":
    raise SystemExit(main())
