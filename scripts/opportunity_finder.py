#!/usr/bin/env python3
"""Find actionable SEO/content opportunities from the live Savostyanov Law site.

Read-only by design: fetches public pages and writes a JSON report. It never
publishes or edits production content.
"""
from __future__ import annotations
import argparse, json, re, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

UA = "SavostyanovLaw-OpportunityFinder/1.0"

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
    findings=[{"url":p["url"],"type":x} for p in pages for x in p.get("opportunities",[])]
    return {"agent":"opportunity-finder","baseUrl":base,"pages":pages,"findingCount":len(findings),"findings":findings,"status":"HEALTHY" if not any(f["type"]=="fetch_failed" for f in findings) else "NEEDS ATTENTION"}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--base-url",default="https://thousandoaksinjury.com"); ap.add_argument("--output",required=True); ap.add_argument("--paths",nargs="*",default=["/","/agoura-hills/","/westlake-village/","/oak-park/","/newbury-park/","/camarillo/","/simi-valley/","/ru/"])
    a=ap.parse_args(); report=analyze(a.base_url,a.paths); out=Path(a.output); out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8"); print(json.dumps({"status":report["status"],"findings":report["findingCount"]})); return 0 if report["status"]=="HEALTHY" else 1
if __name__=="__main__": raise SystemExit(main())
