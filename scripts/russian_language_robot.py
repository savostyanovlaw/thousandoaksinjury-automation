#!/usr/bin/env python3
"""Audit the Russian landing page without modifying or publishing content."""
from __future__ import annotations
import argparse,json,re
from pathlib import Path

def audit_html(html):
 lower=html.lower();issues=[]
 if not re.search(r'<html[^>]+lang=["\']ru(?:-[a-z]+)?["\']',html,re.I):issues.append('wrong_language')
 text=re.sub(r'<[^>]+>',' ',html)
 if len(re.findall(r'[А-Яа-яЁё]',text))<40:issues.append('missing_russian_copy')
 if not re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'][^"\']+',html,re.I):issues.append('missing_meta_description')
 m=re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)',html,re.I)
 if not m:issues.append('missing_canonical')
 elif not m.group(1).rstrip('/').endswith('/ru'):issues.append('canonical_mismatch')
 if 'tel:+18182138798' not in lower:issues.append('missing_phone')
 if 'mailto:attorney@savostyanovlaw.com' not in lower:issues.append('missing_email')
 if lower.count('<h1')!=1:issues.append('h1_count')
 return {'agent':'russian-language-robot','mode':'READ_ONLY','publishAllowed':False,'issues':issues,'findingCount':len(issues)}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--page',default='website/ru/index.html');ap.add_argument('--output',required=True);a=ap.parse_args();r=audit_html(Path(a.page).read_text(encoding='utf-8'));p=Path(a.output);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'findings':r['findingCount']}));return 0
if __name__=='__main__':raise SystemExit(main())
