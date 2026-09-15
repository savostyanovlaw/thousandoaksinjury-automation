#!/usr/bin/env python3
"""Generate deterministic PI content briefs/drafts for attorney review; never publish."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path
SAFE=re.compile(r"^[A-Za-z0-9][A-Za-z0-9 .,'&()/+-]{1,79}$")

def clean(value,name):
 value=' '.join(value.split())
 if not SAFE.fullmatch(value):raise ValueError(f'Invalid {name}')
 return value

def build_brief(topic,city):
 topic=clean(topic,'topic');city=clean(city,'city');title=f'{city} {topic.title()} Lawyer: What Injured Californians Should Know'
 sections=[f'What a {topic} claim can involve',f'Common injuries after a {topic}',f'Evidence to preserve in {city}','California deadlines and insurance issues','How an attorney can evaluate the claim','Frequently asked questions']
 draft=(f'# {title}\n\nThis attorney-review draft explains general California personal injury issues after a {topic} in {city}. '
        'Every claim depends on its facts, available evidence, insurance coverage, and applicable law.\n\n'+
        '\n\n'.join(f'## {s}\nDraft guidance for attorney review. Add verified, matter-specific legal authority and locally relevant facts before publication.' for s in sections)+
        '\n\n## Case review\nSavostyanov Law Corporation can evaluate the circumstances of a potential personal injury claim. No outcome is promised.')
 return {'agent':'content-creator','mode':'DRAFT_ONLY','topic':topic,'city':city,'title':title,'sections':sections,'requiresAttorneyReview':True,'publishAllowed':False,'draft':draft}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--topic',required=True);ap.add_argument('--city',default='Thousand Oaks');ap.add_argument('--output',required=True);a=ap.parse_args();r=build_brief(a.topic,a.city);p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'title':r['title'],'mode':r['mode']}));return 0
if __name__=='__main__':raise SystemExit(main())
