#!/usr/bin/env python3
"""Analyze internal linking and produce review-only proposals; never edits production."""
import argparse, json, urllib.parse, urllib.request
from html.parser import HTMLParser
from pathlib import Path

class P(HTMLParser):
 def __init__(self): super().__init__(); self.links=[]
 def handle_starttag(self,t,a):
  d=dict(a)
  if t=='a' and d.get('href'): self.links.append(d['href'])

def fetch(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'SLC-LinkBuilder/1.0'}),timeout=20) as r:
  return r.read().decode('utf8','replace')

def normalize(url):
 p=urllib.parse.urlsplit(url)
 path=p.path or '/'
 if not path.endswith('/') and '.' not in path.rsplit('/',1)[-1]: path += '/'
 return urllib.parse.urlunsplit((p.scheme,p.netloc,path,'',''))

def analyze(base,paths):
 base=base.rstrip('/')
 origin=urllib.parse.urlsplit(base).netloc
 known={normalize(base+p) for p in paths}
 rows=[]; proposals=[]
 for pth in paths:
  u=normalize(base+pth)
  try:
   parser=P(); parser.feed(fetch(u)); targets=set()
   for href in parser.links:
    absolute=normalize(urllib.parse.urljoin(u,href))
    if urllib.parse.urlsplit(absolute).netloc == origin: targets.add(absolute)
   missing=sorted(known-targets-{u})[:5]
   rows.append({'url':u,'internalLinkCount':len(targets),'suggestedLinks':missing})
   for target in missing:
    proposals.append({'source':u,'target':target,'reason':'Known internal page is not linked from this source; review topical relevance and anchor text before implementation.'})
  except Exception as e:
   rows.append({'url':u,'error':type(e).__name__,'suggestedLinks':[]})
 return {'agent':'internal-link-builder','mode':'PROPOSAL_ONLY','publishAllowed':False,'pages':rows,'proposals':proposals,'suggestionCount':len(proposals)}

def main():
 a=argparse.ArgumentParser(); a.add_argument('--output',required=True); a.add_argument('--base-url',default='https://thousandoaksinjury.com'); x=a.parse_args()
 paths=['/','/agoura-hills/','/westlake-village/','/oak-park/','/newbury-park/','/camarillo/','/simi-valley/']
 r=analyze(x.base_url,paths); p=Path(x.output); p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(r,indent=2)+'\n'); return 0
if __name__=='__main__': raise SystemExit(main())
