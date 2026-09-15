#!/usr/bin/env python3
"""Create attorney-review video briefs/scripts; no rendering, upload, or publishing."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path
SAFE=re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .,'&()/+-]{1,79}$")
def clean(v,n):
 v=' '.join(v.split())
 if not SAFE.fullmatch(v):raise ValueError(f'Invalid {n}')
 return v
def build_brief(topic,location):
 topic=clean(topic,'topic');location=clean(location,'location');title=f'{topic.title()} in {location}: 3 Things to Know'
 scenes=[
 {'seconds':'0-5','purpose':'hook','script':f'Injured after {topic} in {location}? Here are three issues worth preserving early.'},
 {'seconds':'5-18','purpose':'evidence','script':'Save photographs, witness information, insurance details, and medical documentation.'},
 {'seconds':'18-32','purpose':'legal-context','script':'California injury claims can involve deadlines, fault questions, insurance coverage, and proof of damages.'},
 {'seconds':'32-45','purpose':'cta','script':'For a case-specific evaluation, speak directly with a California personal injury attorney.'}]
 return {'agent':'video-engine','mode':'BRIEF_ONLY','publishAllowed':False,'renderAllowed':False,'requiresAttorneyReview':True,'topic':topic,'location':location,'title':title,'format':'vertical-short','targetSeconds':45,'scenes':scenes,'caption':f'{title}. General information only; every claim depends on its facts.'}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--topic',required=True);ap.add_argument('--location',default='Thousand Oaks');ap.add_argument('--output',required=True);a=ap.parse_args();r=build_brief(a.topic,a.location);p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'title':r['title'],'mode':r['mode']}));return 0
if __name__=='__main__':raise SystemExit(main())
