#!/usr/bin/env python3
"""Audit local landing pages and emit a report without editing website files."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path
from html.parser import HTMLParser

CITIES={
'agoura-hills':'Agoura Hills','camarillo':'Camarillo','newbury-park':'Newbury Park',
'oak-park':'Oak Park','simi-valley':'Simi Valley','westlake-village':'Westlake Village'}

class Parser(HTMLParser):
 def __init__(self): super().__init__();self.title='';self.meta='';self.canonical='';self.h1=[];self.schemas=[];self.links=[];self._tag=None;self._buf=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if tag in ('title','h1'): self._tag=tag;self._buf=[]
  if tag=='meta' and a.get('name','').lower()=='description': self.meta=a.get('content','')
  if tag=='link' and a.get('rel','').lower()=='canonical': self.canonical=a.get('href','')
  if tag=='script' and a.get('type','').lower()=='application/ld+json': self._tag='schema';self._buf=[]
  if tag=='a' and a.get('href'): self.links.append(a['href'])
 def handle_data(self,data):
  if self._tag:self._buf.append(data)
 def handle_endtag(self,tag):
  text=' '.join(''.join(self._buf).split())
  if tag=='title' and self._tag=='title':self.title=text;self._tag=None
  elif tag=='h1' and self._tag=='h1':self.h1.append(text);self._tag=None
  elif tag=='script' and self._tag=='schema':self.schemas.append(text);self._tag=None

def analyze_page(slug,html):
 city=CITIES.get(slug,slug.replace('-',' ').title());p=Parser();p.feed(html);issues=[]
 if city.lower() not in p.title.lower():issues.append('missing_city_in_title')
 if not p.meta:issues.append('missing_meta_description')
 elif city.lower() not in p.meta.lower():issues.append('missing_city_in_meta')
 if not p.canonical:issues.append('missing_canonical')
 elif not p.canonical.endswith('/'+slug+'/'):issues.append('canonical_mismatch')
 if len(p.h1)!=1:issues.append('h1_count')
 elif city.lower() not in p.h1[0].lower():issues.append('missing_city_in_h1')
 schema=' '.join(p.schemas).lower()
 if 'legalservice' not in schema:issues.append('missing_legalservice_schema')
 if not any(x.lower().startswith('tel:+18182138798') for x in p.links):issues.append('missing_phone')
 if not any(x.lower().startswith('mailto:attorney@savostyanovlaw.com') for x in p.links):issues.append('missing_email')
 return {'slug':slug,'city':city,'title':p.title,'canonical':p.canonical,'issues':issues}

def scan(root,slugs=None):
 slugs=slugs or list(CITIES);pages=[]
 for slug in slugs:
  path=Path(root)/slug/'index.html'
  if not path.exists():pages.append({'slug':slug,'city':CITIES.get(slug,slug),'issues':['missing_page']});continue
  pages.append(analyze_page(slug,path.read_text(encoding='utf-8')))
 count=sum(len(x['issues']) for x in pages)
 return {'agent':'local-seo-robot','mode':'READ_ONLY','pages':pages,'findingCount':count,'status':'HEALTHY' if count==0 else 'OPPORTUNITIES FOUND'}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--site-root',default='website');ap.add_argument('--output',required=True);a=ap.parse_args();r=scan(Path(a.site_root));out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'status':r['status'],'findings':r['findingCount']}));return 0
if __name__=='__main__':raise SystemExit(main())
