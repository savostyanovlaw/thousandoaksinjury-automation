#!/usr/bin/env python3
"""Find actionable SEO/content opportunities from the live Savostyanov Law site.

Read-only by design: fetches public pages and writes review-only proposals. It
never publishes or edits production content.
"""
from __future__ import annotations
import argparse, json, re, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

UA = "SavostyanovLaw-OpportunityFinder/1.0"

DEFAULT_CITY = "Thousand Oaks"
CITY_LABELS = {
    "agoura-hills": "Agoura Hills",
    "westlake-village": "Westlake Village",
    "oak-park": "Oak Park",
    "newbury-park": "Newbury Park",
    "camarillo": "Camarillo",
    "simi-valley": "Simi Valley",
}
PRACTICE_AREA_TOPICS = {
    "car-accident-lawyer": "car accident",
    "dog-bite-lawyer": "dog bite",
    "slip-and-fall-lawyer": "slip and fall accident",
}


def topic_and_city_for_url(url: str, default_city: str = DEFAULT_CITY) -> tuple[str, str]:
    """Derive a real personal-injury topic/city from a live page URL.

    A technical SEO opportunity type (``h1_count``, ``missing_title``, ...)
    describes a structural defect on a page, not a legal topic. Handing that
    raw issue type to Content Creator as the "topic" produces nonsense like a
    "h1 count review" article. This maps the page's own path back to the real
    practice area or city it covers, so Content Creator drafts something an
    attorney would recognize as reviewable content.
    """
    path = urllib.parse.urlsplit(url).path.strip("/")
    slug = path.split("/", 1)[0] if path else ""
    if slug in PRACTICE_AREA_TOPICS:
        return PRACTICE_AREA_TOPICS[slug], default_city
    if slug in CITY_LABELS:
        return "personal injury", CITY_LABELS[slug]
    return "personal injury", default_city

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.title=""; self.h1=[]; self.links=[]; self._title=False; self._h1=False; self._buf=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=="title": self._title=True; self._buf=[]
        elif tag=="h1": self._h1=True; self._buf=[]
        elif tag=="a" and a.get("href"): self.links.append(a["href"])
    def handle_data(self,data):
        if self._title or self._h1: self._buf.append(data)
    def handle_endtag(self,tag):
        text=" ".join("".join(self._buf).split())
        if tag=="title" and self._title: self.title=text; self._title=False
        elif tag=="h1" and self._h1: self.h1.append(text); self._h1=False

def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":UA})
    with urllib.request.urlopen(req,timeout=20) as r: return r.read().decode("utf-8","replace")

RULES={
    "missing_title": ("HIGH", "The page has no HTML title, weakening search-result relevance signals.", "Draft a unique, accurate title for attorney review; do not publish automatically."),
    "short_title": ("MEDIUM", "The title is unusually short and may not communicate the page topic clearly.", "Draft a clearer title variant for attorney review."),
    "h1_count": ("HIGH", "The page does not contain exactly one H1, creating an avoidable structural ambiguity.", "Review heading structure and propose one descriptive H1 without changing production."),
    "thin_content": ("MEDIUM", "The page contains fewer than 350 detected words and may not answer enough user questions.", "Identify missing user-intent topics and draft additions for attorney review; verify all legal claims."),
    "weak_internal_linking": ("MEDIUM", "The page has fewer than three detected internal links.", "Propose relevant internal links and anchor text for attorney review."),
    "fetch_failed": ("HIGH", "The page could not be fetched, so content quality cannot be assessed reliably.", "Retry the fetch and verify site availability before making any content recommendation."),
}

def proposal(url, issue):
    priority, reason, action=RULES[issue]
    return {"url":url,"type":issue,"priority":priority,"reason":reason,"recommendedAction":action,"approvalStatus":"PENDING_ATTORNEY_REVIEW"}

def analyze(base_url, paths):
    base=base_url.rstrip("/"); pages=[]
    for path in paths:
        url=base+(path if path.startswith("/") else "/"+path)
        try:
            html=fetch(url); p=PageParser(); p.feed(html)
            words=len(re.findall(r"\b[\w'-]+\b",re.sub(r"<[^>]+>"," ",html)))
            internal=sum(1 for h in p.links if h.startswith("/") or h.startswith(base))
            issues=[]
            if not p.title: issues.append("missing_title")
            elif len(p.title)<30: issues.append("short_title")
            if len(p.h1)!=1: issues.append("h1_count")
            if words<350: issues.append("thin_content")
            if internal<3: issues.append("weak_internal_linking")
            pages.append({"url":url,"title":p.title,"h1Count":len(p.h1),"wordCount":words,"internalLinks":internal,"opportunities":issues})
        except Exception as exc:
            pages.append({"url":url,"error":type(exc).__name__,"opportunities":["fetch_failed"]})
    findings=[proposal(p["url"],x) for p in pages for x in p.get("opportunities",[])]
    findings.sort(key=lambda f: ({"HIGH":0,"MEDIUM":1,"LOW":2}[f["priority"]],f["url"],f["type"]))
    status="NEEDS ATTENTION" if any(f["type"]=="fetch_failed" for f in findings) else "HEALTHY"
    return {"agent":"opportunity-finder","mode":"PROPOSAL_ONLY","publishAllowed":False,"requiresAttorneyReview":len(findings)>0,"baseUrl":base,"pages":pages,"findingCount":len(findings),"findings":findings,"status":status}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--base-url",default="https://thousandoaksinjury.com"); ap.add_argument("--output",required=True); ap.add_argument("--paths",nargs="*",default=["/","/agoura-hills/","/westlake-village/","/oak-park/","/newbury-park/","/camarillo/","/simi-valley/","/ru/"])
    a=ap.parse_args(); report=analyze(a.base_url,a.paths); out=Path(a.output); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"); print(json.dumps({"status":report["status"],"findings":report["findingCount"]})); return 0 if report["status"]=="HEALTHY" else 1
if __name__=="__main__": raise SystemExit(main())
