#!/usr/bin/env python3
"""Analyze internal linking and propose links without editing production."""
import argparse,json,re,urllib.parse,urllib.request
from html.parser import HTMLParser
from pathlib import Path
class P(HTMLParser):
 def __init__(self): super().__init__(); self.links=[]
 def handle_starttag(self,t,a):
  d=dict(a)
  if t=='a' and d.get('href'): self.links.append(d['href'])
def fetch(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'SLC-LinkBuilder/1.0'}),timeout=20) as r:return r.read().decode('utf8','replace')
def analyze(base,paths):
 base=base.rstrip('/'); rows=[]; known={base+p for p in paths}
 for pth in paths:
  u=base+pth
  try:
   p=P();p.feed(fetch(u)); targets={urllib.parse.urljoin(u,x).split('#')[0] for x in p.links}; missing=sorted(known-targets-{u})
   rows.append({'url':u,'internalLinkCount':sum(x.startswith(base) for x in targets),'suggestedLinks':missing[:5]})
  except Exception as e: rows.append({'url':u,'error':type(e).__name__,'suggestedLinks':[]})
 return {'agent':'internal-link-builder','pages':rows,'suggestionCount':sum(len(x['suggestedLinks']) for x in rows)}
def main():
 a=argparse.ArgumentParser();a.add_argument('--output',required=True);a.add_argument('--base-url',default='https://thousandoaksinjury.com');x=a.parse_args();r=analyze(x.base_url,['/','/agoura-hills/','/westlake-village/','/oak-park/','/newbury-park/','/camarillo/','/simi-valley/']);p=Path(x.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n');return 0
if __name__=='__main__':raise SystemExit(main())
