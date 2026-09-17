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

def _section_bodies(topic,city):
 return [
  f"A {topic} claim in {city} should be developed from the actual event, the people and property involved, available insurance, and evidence that can be authenticated. The draft should identify disputed facts and missing information rather than assume fault, coverage, causation, or recoverable damages.",
  f"After a {topic}, the relevant injury discussion should track the client's documented symptoms, diagnoses, treatment, functional limitations, and course of recovery. Avoid converting common injury patterns into client-specific medical conclusions, and leave medical causation and prognosis to appropriate records and qualified professionals.",
  f"Evidence preservation in {city} may include photographs or video, witness information, incident or collision records, communications, insurance materials, damaged property, and treatment records when relevant. The useful evidence depends on the facts, so the attorney-review draft should flag items to investigate instead of representing that any particular item exists.",
  f"California deadlines, insurance requirements, defenses, and damages rules can materially affect a {topic} matter, but they should not be stated as case-specific legal conclusions from a generic generator. Before publication, verify current legal authority, applicable limitation periods, coverage language, governmental-claim issues if any, and any rule discussed in the final article.",
  f"An attorney evaluating a {topic} matter can compare the client's account with available records, identify additional evidence, examine potential defendants and insurance, and assess disputed liability and damages issues. This draft is an intake and content-development aid only; it does not predict case value, settlement, liability, or outcome.",
  f"Frequently asked questions about a {topic} should be answered from verified facts and current California authority. Useful questions may address evidence, treatment documentation, insurance communications, litigation process, and timing, but every proposed answer requires attorney review before it is used as public-facing legal information."
 ]

def build_brief(topic,city):
 topic=clean(topic,'topic');city=clean(city,'city');title=f'{city} {topic.title()} Lawyer: What Injured Californians Should Know'
 sections=[f'What a {topic} claim can involve',f'Common injuries after a {topic}',f'Evidence to preserve in {city}','California deadlines and insurance issues','How an attorney can evaluate the claim','Frequently asked questions']
 bodies=_section_bodies(topic,city)
 section_drafts=[{'heading':heading,'body':body} for heading,body in zip(sections,bodies)]
 draft=(f'# {title}\n\nThis attorney-review draft explains general California personal injury issues after a {topic} in {city}. Every claim depends on its facts, available evidence, insurance coverage, and applicable law. Verify current legal authority and all matter-specific facts before publication.\n\n'+'\n\n'.join(f"## {s['heading']}\n{s['body']}" for s in section_drafts)+'\n\n## Case review\nSavostyanov Law Corporation can evaluate the circumstances of a potential personal injury claim. No outcome is promised.')
 return {'agent':'content-creator','mode':'DRAFT_ONLY','topic':topic,'city':city,'title':title,'sections':sections,'sectionDrafts':section_drafts,'requiresAttorneyReview':True,'publishAllowed':False,'draft':draft}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--topic',required=True);ap.add_argument('--city',default='Thousand Oaks');ap.add_argument('--output',required=True);a=ap.parse_args();r=build_brief(a.topic,a.city);p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'title':r['title'],'mode':r['mode']}));return 0
if __name__=='__main__':raise SystemExit(main())
