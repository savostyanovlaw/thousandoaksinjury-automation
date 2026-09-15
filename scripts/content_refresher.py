#!/usr/bin/env python3
"""Rank site pages for content refresh; proposal-only and non-publishing."""
from __future__ import annotations
import argparse,json,re,time
from pathlib import Path

def analyze_html(path,html,age_days):
 words=len(re.findall(r"\b[\w'-]+\b",re.sub(r'<[^>]+>',' ',html)));reasons=[]
 if age_days>=365:reasons.append('stale')
 if words<350:reasons.append('thin_content')
 if not re.search(r'<meta[^>]+name=["\']description["\']',html,re.I):reasons.append('missing_meta_description')
 score=(2 if 'stale' in reasons else 0)+(2 if 'thin_content' in reasons else 0)+(1 if 'missing_meta_description' in reasons else 0)
 priority='HIGH' if score>=4 else 'MEDIUM' if score>=2 else 'LOW' if score else 'NONE'
 return {'path':path,'ageDays':age_days,'wordCount':words,'reasons':reasons,'priority':priority,'mode':'PROPOSAL_ONLY','publishAllowed':False}
def scan(root):
 root=Path(root);now=time.time();rows=[]
 for f in sorted(root.rglob('index.html')):
  rel='/' if f==root/'index.html' else '/'+str(f.parent.relative_to(root)).replace('\\','/')+'/'
  age=max(0,int((now-f.stat().st_mtime)/86400));rows.append(analyze_html(rel,f.read_text(encoding='utf-8'),age))
 order={'HIGH':0,'MEDIUM':1,'LOW':2,'NONE':3};rows.sort(key=lambda x:(order[x['priority']],-x['ageDays'],x['path']))
 return {'agent':'content-refresher','mode':'PROPOSAL_ONLY','publishAllowed':False,'pages':rows,'refreshCandidates':sum(x['priority']!='NONE' for x in rows)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--site-root',default='website');ap.add_argument('--output',required=True);a=ap.parse_args();r=scan(a.site_root);p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'candidates':r['refreshCandidates']}));return 0
if __name__=='__main__':raise SystemExit(main())
