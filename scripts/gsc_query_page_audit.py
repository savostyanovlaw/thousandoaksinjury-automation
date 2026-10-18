#!/usr/bin/env python3
"""Search Console query x page audit: last 28 days vs the preceding 28 days.

Two ways to feed it (no credentials are stored in the repo):

1) Live API (owner or a user with Search Console access):
     gcloud auth application-default login \
       --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform
     GSC_ACCESS_TOKEN=$(gcloud auth application-default print-access-token) \
       python3 scripts/gsc_query_page_audit.py --site sc-domain:thousandoaksinjury.com --out docs/seo/gsc-audit.md

   (Use --site https://thousandoaksinjury.com/ if the property is URL-prefix.)

2) Offline: two JSON files saved from the API's searchAnalytics.query with
   dimensions ["query","page"]:  --current cur.json --previous prev.json

Impressions are not visits. Only clicks are visits from search.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

TARGETS = [
    ("PI core", r"personal injury (lawyer|attorney)"),
    ("Car accident", r"(car|auto) (accident|crash|wreck) (lawyer|attorney)"),
    ("Dog bite", r"dog (bite|attack) (lawyer|attorney)"),
    ("Motorcycle", r"motorcycle (accident )?(lawyer|attorney)"),
    ("Slip and fall", r"(slip and fall|premises) (lawyer|attorney)"),
    ("Wrongful death", r"wrongful death (lawyer|attorney)"),
    ("Russian", r"[а-яё]"),
    ("NON-PI: business", r"business (lawyer|attorney)"),
]
LOCAL = r"thousand oaks|westlake|newbury park|agoura|oak park|simi|camarillo|conejo|near me"


def fetch(site, start, end, token):
    url = "https://searchconsole.googleapis.com/webmasters/v3/sites/%s/searchAnalytics/query" % urllib.parse.quote(site, safe="")
    rows, start_row = [], 0
    while True:
        body = json.dumps({"startDate": start, "endDate": end, "dimensions": ["query", "page"],
                           "rowLimit": 25000, "startRow": start_row, "dataState": "final"}).encode()
        req = urllib.request.Request(url, data=body, headers={"authorization": "Bearer " + token, "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            batch = json.load(resp).get("rows", [])
        rows += batch
        if len(batch) < 25000:
            return rows
        start_row += 25000


def load(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data.get("rows", data) if isinstance(data, dict) else data


def classify(query):
    for name, pattern in TARGETS:
        if re.search(pattern, query, re.I):
            return name
    return None


def aggregate(rows):
    out = {}
    for row in rows:
        query, page = row["keys"]
        key = (query, page)
        cur = out.setdefault(key, {"clicks": 0, "impressions": 0, "pos_weight": 0.0})
        cur["clicks"] += row.get("clicks", 0)
        cur["impressions"] += row.get("impressions", 0)
        cur["pos_weight"] += row.get("position", 0) * row.get("impressions", 0)
    return out


def summarize(agg, pick):
    clicks = sum(v["clicks"] for k, v in agg.items() if pick(k))
    imps = sum(v["impressions"] for k, v in agg.items() if pick(k))
    pos = sum(v["pos_weight"] for k, v in agg.items() if pick(k))
    return clicks, imps, (clicks / imps if imps else 0.0), (pos / imps if imps else 0.0)


def fmt(clicks, imps, ctr, pos):
    return f"{clicks:g} | {imps:g} | {ctr:.2%} | {pos:.1f}" if imps else "0 | 0 | – | –"


def report(cur, prev, label_cur, label_prev):
    a, b = aggregate(cur), aggregate(prev)
    lines = [f"# Search Console query × page audit", "",
             f"Current: {label_cur} · Previous: {label_prev}. Columns: clicks | impressions | CTR | avg position (impression-weighted).",
             "Impressions are not visits; only clicks are visits from search.", "",
             "## Totals", "", "| Period | Clicks | Impressions | CTR | Position |", "| --- | --- | --- | --- | --- |",
             f"| Current | {fmt(*summarize(a, lambda k: True))} |",
             f"| Previous | {fmt(*summarize(b, lambda k: True))} |", "",
             "## Intent groups", "", "| Group | Local only? | Current | Previous |", "| --- | --- | --- | --- |"]
    for name, _ in TARGETS:
        for local in (True, False):
            pick = (lambda k, n=name, l=local: classify(k[0]) == n and (bool(re.search(LOCAL, k[0], re.I)) or not l))
            lines.append(f"| {name} | {'local' if local else 'all'} | {fmt(*summarize(a, pick))} | {fmt(*summarize(b, pick))} |")
    lines += ["", "## Query × landing page (current period, PI and non-PI groups, top 60 by impressions)", "",
              "| Group | Query | Landing page | Clicks | Impr. | CTR | Pos. | Prev impr. | Prev pos. |",
              "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"]
    rows = sorted(((k, v) for k, v in a.items() if classify(k[0])), key=lambda kv: -kv[1]["impressions"])[:60]
    for (query, page), v in rows:
        p = b.get((query, page), {"impressions": 0, "pos_weight": 0})
        pos = v["pos_weight"] / v["impressions"] if v["impressions"] else 0
        ppos = f"{p['pos_weight'] / p['impressions']:.1f}" if p["impressions"] else "–"
        ctr = v["clicks"] / v["impressions"] if v["impressions"] else 0
        path = re.sub(r"^https?://[^/]+", "", page)
        lines.append(f"| {classify(query)} | {query} | {path} | {v['clicks']:g} | {v['impressions']:g} | {ctr:.1%} | {pos:.1f} | {p['impressions']:g} | {ppos} |")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="sc-domain:thousandoaksinjury.com")
    ap.add_argument("--current")
    ap.add_argument("--previous")
    ap.add_argument("--end", help="last day of current window (default: today-3, GSC data lag)")
    ap.add_argument("--out", default="-")
    args = ap.parse_args()
    end = dt.date.fromisoformat(args.end) if args.end else dt.date.today() - dt.timedelta(days=3)
    cur_start, prev_end = end - dt.timedelta(days=27), end - dt.timedelta(days=28)
    prev_start = prev_end - dt.timedelta(days=27)
    label_cur, label_prev = f"{cur_start}–{end}", f"{prev_start}–{prev_end}"
    if args.current and args.previous:
        cur, prev = load(args.current), load(args.previous)
    else:
        token = os.environ.get("GSC_ACCESS_TOKEN")
        if not token:
            sys.exit("Set GSC_ACCESS_TOKEN (see the docstring) or pass --current/--previous JSON files.")
        cur = fetch(args.site, str(cur_start), str(end), token)
        prev = fetch(args.site, str(prev_start), str(prev_end), token)
    text = report(cur, prev, label_cur, label_prev)
    if args.out == "-":
        sys.stdout.write(text)
    else:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
