#!/usr/bin/env python3
"""Read-only competitor snapshot monitor for PI search competitors."""
from __future__ import annotations
import argparse, hashlib, json, re, urllib.request
from pathlib import Path

UA='SavostyanovLaw-CompetitorMonitor/1.0'

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA})
    with urllib.request.urlopen(req,timeout=20) as r: return r.read().decode('utf-8','replace')

def title(html):
    m=re.search(r'<title[^>]*>(.*?)</title>',html,re.I|re.S); return ' '.join(re.sub(r'<[^>]+>',' ',m.group(1)).split()) if m else ''

def analyze(urls):
    rows=[]
    for url in urls:
        try:
            html=fetch(url); clean=re.sub(r'\s+',' ',html)
            rows.append({'url':url,'title':title(html),'contentHash':hashlib.sha256(clean.encode()).hexdigest()[:16],'bytes':len(html.encode()),'status':'OK'})
        except Exception as exc: rows.append({'url':url,'status':'UNAVAILABLE','error':type(exc).__name__})
    return {'agent':'competitor-monitor','competitors':rows,'available':sum(x['status']=='OK' for x in rows),'unavailable':sum(x['status']!='OK' for x in rows)}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--output',required=True); ap.add_argument('--url',action='append',dest='urls',default=[]); a=ap.parse_args()
    urls=a.urls or ['https://www.ghitterman.com/','https://www.napolinlaw.com/']
    r=analyze(urls); p=Path(a.output); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(r,indent=2)+'\n'); print(json.dumps({'available':r['available'],'unavailable':r['unavailable']})); return 0
if __name__=='__main__': raise SystemExit(main())
