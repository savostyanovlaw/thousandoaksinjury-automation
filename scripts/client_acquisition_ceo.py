"""Client Acquisition CEO: turn marketing signals into owner-reviewable lead actions.

This agent never publishes. It ranks work by likely qualified-PI-lead impact,
requires evidence, and keeps owner approval between proposal and execution.
"""
from __future__ import annotations
import json, sys
from pathlib import Path

PI_TERMS=("personal injury","car accident","auto accident","motorcycle","pedestrian","dog bite","slip and fall","wrongful death","injury lawyer","injury attorney")
HIGH_INTENT=("lawyer","attorney","free consultation","near me")

def score(row):
    q=str(row.get("query","")).lower()
    imp=float(row.get("impressions") or 0)
    pos=float(row.get("position") or 100)
    clicks=float(row.get("clicks") or 0)
    pi=any(t in q for t in PI_TERMS)
    intent=any(t in q for t in HIGH_INTENT)
    opportunity=max(0,21-min(pos,21))/20
    return round((imp**0.5)*(1+pi*2+intent)*(.35+.65*opportunity)*(1 if clicks==0 else .75),2)

def build(rows):
    ranked=sorted(({**r,"leadImpactScore":score(r)} for r in rows if any(t in str(r.get("query","")).lower() for t in PI_TERMS)),key=lambda x:x["leadImpactScore"],reverse=True)
    top=ranked[:10]
    return {"agent":"client-acquisition-ceo","mode":"PROPOSAL_ONLY","publishAllowed":False,
      "status":"REVIEW" if top else "HEALTHY","findingCount":len(top),
      "northStar":["qualified PI leads","consultations","signed cases"],
      "guardrails":["No merge, deploy, publication, outreach, ad spend, or listing change without owner approval.","Do not optimize for traffic that is not relevant to California personal injury."],
      "priorities":top,
      "recommendedAction":"Review the highest-intent zero/low-click PI opportunities; prepare only approved conversion/SEO experiments." if top else "No qualified PI opportunity supplied."}

if __name__=="__main__":
    inp=Path(sys.argv[1]) if len(sys.argv)>1 else Path("artifacts/client-acquisition-ceo/input.json")
    out=Path(sys.argv[2]) if len(sys.argv)>2 else Path("artifacts/client-acquisition-ceo/report.json")
    rows=json.loads(inp.read_text()) if inp.exists() else []
    if isinstance(rows,dict): rows=rows.get("rows",[])
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(build(rows),indent=2))
