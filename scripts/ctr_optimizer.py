#!/usr/bin/env python3
"""Audit title/meta CTR signals and propose replacements without publishing them."""
from __future__ import annotations
import argparse,json
from html.parser import HTMLParser
from pathlib import Path

LANGUAGE_DIRECTORIES={'ru'}

def _is_cyrillic(text):
 return any('\u0400' <= ch <= '\u04ff' for ch in (text or ''))

def _language(title,desc,path):
 return 'ru' if path.startswith('/ru/') or _is_cyrillic(title+' '+desc) else 'en'

class HeadParser(HTMLParser):
 def __init__(self):
  super().__init__();self.title='';self.description='';self._title=False;self._buf=[]
 def handle_starttag(self,tag,attrs):
  values={str(k).lower():v for k,v in attrs}
  if tag.lower()=='title':self._title=True;self._buf=[]
  if tag.lower()=='meta' and str(values.get('name','')).lower()=='description':self.description=' '.join(str(values.get('content','')).split())
 def handle_data(self,data):
  if self._title:self._buf.append(data)
 def handle_endtag(self,tag):
  if tag.lower()=='title' and self._title:self.title=' '.join(''.join(self._buf).split());self._title=False

def suggest_title(slug,city):
 candidate=f'{city} Personal Injury Lawyer | Savostyanov Law'
 return candidate if len(candidate)<=60 else f'{city} Injury Lawyer | Savostyanov Law'[:60].rstrip()

def suggest_description(slug,city):
 topic=slug.replace('-',' ') if slug and slug!='home' else 'injury'
 # Avoid fragile a/an grammar and mechanical lower-case city substitutions.
 candidate=f'Discuss your {topic} claim directly with a personal injury attorney serving {city}. Free consultation; English and Russian.'
 return candidate[:160].rstrip(' ,.;')+'.' if len(candidate)>160 else candidate

def suggest_ru_description():
 return 'Консультация адвоката по делам о травмах и ДТП в Калифорнии. Прямой контакт с адвокатом. Бесплатная консультация на русском и английском.'

def suggest_ru_title():
 return 'Адвокат по травмам и ДТП в Калифорнии | Savostyanov Law'

def _proposal(field,current,proposed,rationale):
 return {'field':field,'currentValue':current,'proposedValue':proposed,'rationale':rationale}

def analyze_html(path,html,city='Thousand Oaks',performance=None):
 parser=HeadParser();parser.feed(html);title=parser.title;desc=parser.description;issues=[];proposals=[]
 if not title:issues.append('missing_title')
 elif len(title)<30:issues.append('title_too_short')
 elif len(title)>60:issues.append('title_too_long')
 if not desc:issues.append('missing_meta_description')
 elif len(desc)<90:issues.append('description_too_short')
 elif len(desc)>160:issues.append('description_too_long')
 slug=path.strip('/').split('/')[-1] or 'home'
 title_issue=any(x in issues for x in ('missing_title','title_too_short','title_too_long'))
 description_issue=any(x in issues for x in ('missing_meta_description','description_too_short','description_too_long'))
 lang=_language(title,desc,path)
 suggested_title=(suggest_ru_title() if lang=='ru' else suggest_title(slug,city)) if title_issue else None
 suggested_description=(suggest_ru_description() if lang=='ru' else suggest_description(slug,city)) if description_issue else None
 if title_issue:
  proposals.append(_proposal('title',title,suggested_title,'Title metadata needs a safer search-result candidate.'))
 if description_issue:
  proposals.append(_proposal('meta_description',desc,suggested_description,'Meta description needs a field-specific search-result candidate.'))
 perf=dict(performance) if performance else None
 if perf:
  impressions=float(perf.get('impressions') or 0);ctr=float(perf.get('ctr') or 0);position=float(perf.get('position') or 0)
  if impressions>=100 and 0<position<=10 and ctr<0.02:
   issues.append('low_ctr_opportunity')
   performance_title=suggest_ru_title() if lang=='ru' else suggest_title(slug,city)
   proposals.append(_proposal('title',title,performance_title,f'CTR opportunity: {ctr:.2%} CTR across {int(impressions)} impressions at average position {position:g}; review title relevance to query intent.'))
   if suggested_title is None:suggested_title=performance_title
 return {'path':path,'mode':'PROPOSAL_ONLY','publishAllowed':False,'currentTitle':title,'currentDescription':desc,'issues':issues,'proposals':proposals,'performance':perf,'suggestedTitle':suggested_title,'suggestedDescription':suggested_description}

def scan(root,performance_by_path=None):
 root=Path(root);pages=[];performance_by_path=performance_by_path or {}
 for f in sorted(root.glob('*/index.html')):
  slug=f.parent.name;path='/'+slug+'/'
  if slug.lower() in LANGUAGE_DIRECTORIES:
   pages.append(analyze_html(path,f.read_text(encoding='utf-8'),'California',performance_by_path.get(path)))
   continue
  city=slug.replace('-',' ').title();pages.append(analyze_html(path,f.read_text(encoding='utf-8'),city,performance_by_path.get(path)))
 home=root/'index.html'
 if home.exists():pages.insert(0,analyze_html('/',home.read_text(encoding='utf-8'),'Thousand Oaks',performance_by_path.get('/')))
 return {'agent':'ctr-optimizer','mode':'PROPOSAL_ONLY','publishAllowed':False,'pages':pages,'findingCount':sum(len(x['issues']) for x in pages)}

def load_performance(path):
 if not path:return {}
 raw=json.loads(Path(path).read_text(encoding='utf-8'))
 rows=raw.get('pages',raw) if isinstance(raw,dict) else raw
 if isinstance(rows,dict):return rows
 return {str(row['path']):row for row in rows if isinstance(row,dict) and row.get('path')}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--site-root',default='website');ap.add_argument('--performance-json');ap.add_argument('--output',required=True);a=ap.parse_args();r=scan(a.site_root,load_performance(a.performance_json));p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,indent=2)+'\n',encoding='utf-8');print(json.dumps({'findings':r['findingCount']}));return 0
if __name__=='__main__':raise SystemExit(main())
