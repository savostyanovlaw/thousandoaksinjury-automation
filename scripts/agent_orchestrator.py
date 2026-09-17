#!/usr/bin/env python3
"""Review-only agent orchestrator.

Routes agent artifacts through an explicit approval boundary. This module never
publishes content or mutates the production website.
"""
from dataclasses import dataclass
from typing import Callable, Dict, Any


class ExecutionDenied(RuntimeError):
    pass


@dataclass(frozen=True)
class Artifact:
    artifact_id: str
    revision: str
    agent_id: str
    payload: Dict[str, Any]


def route(agent_id: str, runners: Dict[str, Callable[..., Dict[str, Any]]], **kwargs) -> Artifact:
    if agent_id not in runners:
        raise ValueError("Unknown agent")
    raw = runners[agent_id](**kwargs)
    artifact_id = str(raw.get("artifactId") or raw.get("artifact_id") or "")
    revision = str(raw.get("revision") or raw.get("sourceRevision") or raw.get("source_revision") or "")
    if not artifact_id or not revision:
        raise ValueError("Artifact identity and revision are required")
    return Artifact(artifact_id, revision, agent_id, raw)


def execute(artifact: Artifact, approval: Dict[str, Any], executor: Callable[[Artifact], Any]):
    """Execute an already-approved exact artifact revision once.

    The executor is an injected approval-gated internal action. No publisher is
    provided here; direct public publishing remains prohibited.
    """
    if not approval:
        raise ExecutionDenied("Approval required")
    if approval.get("status") != "APPROVED":
        raise ExecutionDenied("Approval is not approved")
    if approval.get("artifactId") != artifact.artifact_id:
        raise ExecutionDenied("Approval artifact mismatch")
    if str(approval.get("targetRevision")) != artifact.revision:
        raise ExecutionDenied("Stale approval target")
    if approval.get("consumedAt"):
        raise ExecutionDenied("Approval already consumed")
    result = executor(artifact)
    approval["consumedAt"] = "consumed"
    return result
