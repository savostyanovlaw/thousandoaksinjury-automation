#!/usr/bin/env python3
"""Read-only competitor snapshot monitor for PI search competitors."""
from __future__ import annotations
import argparse, hashlib, json, re, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

UA='SavostyanovLaw-CompetitorMonitor/1.0'

class Signals(HTMLParser):
    def __init__(self, url):
        super().__init__(); self.url=url; self.title_parts=[]; self.in_title=False; self.h1=[]; self.in_h1=False; self.h1_parts=[]; self.meta=''; self.paths=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs); tag=tag.lower()
        if tag=='title': self.in_title=True
        elif tag=='h1': self.in_h1=True; self.h1_parts=[]
        elif tag=='meta' and d.get('name','').lower()=='description': self.meta=' '.join(d.get('content','').split())
        elif tag=='a' and d.get('href'):
            absolute=urllib.parse.urljoin(self.url,d['href']); base=urllib.parse.urlsplit(self.url); target=urllib.parse.urlsplit(absolute)
            if target.scheme in ('http','https') and target.netloc.lower()==base.netloc.lower():
                path=target.path or '/'
                if path not in self.paths: self.paths.append(path)
    def handle_endtag(self, tag):
        if tag.lower()=='title': self.in_title=False
        elif tag.lower()=='h1':
            text=' '.join(''.join(self.h1_parts).split())
            if text: self.h1.append(text)
            self.in_h1=False
    def handle_data(self, data):
        if self.in_title: self.title_parts.append(data)
        if self.in_h1: self.h1_parts.append(data)
    @property
    def title(self): return ' '.join(''.join(self.title_parts).split())

def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':UA})
    with urllib.request.urlopen(req,timeout=20) as r: return r.read().decode('utf-8','replace')

def snapshot(url, html):
    p=Signals(url); p.feed(html); clean=re.sub(r'\s+',' ',html)
    return {'url':url,'title':p.title,'metaDescription':p.meta,'h1':p.h1,'internalPaths':sorted(p.paths),'contentHash':hashlib.sha256(clean.encode()).hexdigest()[:16],'bytes':len(html.encode()),'status':'OK'}

def analyze(urls, previous=None):
    rows=[]; findings=[]; old={x.get('url'):x for x in (previous or {}).get('competitors',[])}
    for url in urls:
        try:
            row=snapshot(url,fetch(url)); rows.append(row)
            prior=old.get(url)
            if prior:
                fields=[]
                if prior.get('contentHash')!=row['contentHash']: fields.append('content')
                for key in ('title','metaDescription','h1','internalPaths'):
                    if prior.get(key)!=row[key]: fields.append(key)
                if fields: findings.append({'url':url,'changedFields':fields,'requiresReview':True})
        except Exception as exc: rows.append({'url':url,'status':'UNAVAILABLE','error':type(exc).__name__})
    return {'agent':'competitor-monitor','mode':'MONITOR_ONLY','publishAllowed':False,'competitors':rows,'findings':findings,'available':sum(x['status']=='OK' for x in rows),'unavailable':sum(x['status']!='OK' for x in rows)}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--output',required=True); ap.add_argument('--url',action='append',dest='urls',default=[]); ap.add_argument('--previous'); a=ap.parse_args()
    urls=a.urls or ['https://www.ghitterman.com/','https://www.napolinlaw.com/']
    previous=json.loads(Path(a.previous).read_text()) if a.previous and Path(a.previous).exists() else None
    r=analyze(urls,previous=previous); p=Path(a.output); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(r,indent=2)+'\n'); print(json.dumps({'available':r['available'],'unavailable':r['unavailable'],'findings':len(r['findings'])})); return 0
if __name__=='__main__': raise SystemExit(main())
