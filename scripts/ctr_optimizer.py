#!/usr/bin/env python3
"""Audit title/meta CTR signals and propose replacements without publishing them."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

def field(html,pattern):
 m=re.search(pattern,html,re.I|re.S);return ' '.join(re.sub(r'<[^>]+>',' ',m.group(1)).split()) if m else ''
def suggest_title(slug,city):
 candidate=f'{city} Personal Injury Lawyer | Savostyanov Law'
 return candidate if len(candidate)<=60 else f'{city} Injury Lawyer | Savostyanov Law'[:60].rstrip()
def analyze_html(path,html,city='Thousand Oaks'):
 title=field(html,r'<title[^>]*>(.*?)</title>');m=re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']*)',html,re.I|re.S);desc=' '.join(m.group(1).split()) if m else '';issues=[]
 if not title:issues.append('missing_title')
 elif len(title)<30:issues.append('title_too_short')
 elif len(title)>60:issues.append('title_too_long')
 if not desc:issues.append('missing_meta_description')
 elif len(desc)<90:issues.append('description_too_short')
 elif len(desc)>160:issues.append('description_too_long')
 slug=path.strip('/').split('/')[-1] or 'home'
 return {'path':path,'mode':'PROPOSAL_ONLY','publishAllowed':False,'currentTitle':title,'currentDescription':desc,'issues':issues,'suggestedTitle':suggest_title(slug,city) if issues else None}
def scan(root):
 root=Path(root);pages=[]
 for f in sorted(root.glob('*/index.html')):
  slug=f.parent.name;city=slug.replace('-',' ').title();pages.append(analyze_html('/'+slug+'/',f.read_text(encoding='utf-8'),city))
 home=root/'index.html'
 if home.exists():pages.insert(0,analyze_html('/',home.read_text(encoding='utf-8'),'Thousand Oaks'))
 return {'agent':'ctr-optimizer','mode':'PROPOSAL_ONLY','publishAllowed':False,'pages':pages,'findingCount':sum(len(x['issues']) for x in pages)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--site-root',default='website');ap.add_argument('--output',required=True);a=ap.parse_args();r=scan(a.site_root);p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'findings':r['findingCount']}));return 0
if __name__=='__main__':raise SystemExit(main())
