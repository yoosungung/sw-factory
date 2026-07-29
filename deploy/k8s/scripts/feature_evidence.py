"""Parse/validate M11 feature Done evidence (test + qa + aa + prod)."""

from __future__ import annotations

import re

_FEATURE_FIELDS = (
    ("pr_url", r"(?im)^\s*pr_url:\s*(\S+)"),
    ("merge_sha", r"(?im)^\s*merge_sha:\s*(\S+)"),
    ("test_workflow_run_url", r"(?im)^\s*test_workflow_run_url:\s*(\S+)"),
    ("test_workflow_conclusion", r"(?im)^\s*test_workflow_conclusion:\s*(\S+)"),
    ("test_rollout", r"(?im)^\s*test_rollout:\s*(.+\bOK\b.*)"),
    ("test_smoke", r"(?im)^\s*test_smoke:\s*(HTTP\s+\d+\s+\S+)"),
    ("qa", r"(?im)^\s*qa:\s*(.+)"),
    ("aa", r"(?im)^\s*aa:\s*(.+)"),
    ("prod_workflow_run_url", r"(?im)^\s*prod_workflow_run_url:\s*(\S+)"),
    ("prod_workflow_conclusion", r"(?im)^\s*prod_workflow_conclusion:\s*(\S+)"),
    ("prod_rollout", r"(?im)^\s*prod_rollout:\s*(.+\bOK\b.*)"),
    ("prod_smoke", r"(?im)^\s*prod_smoke:\s*(HTTP\s+\d+\s+\S+)"),
)


def parse_feature_evidence(comment_text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for name, pattern in _FEATURE_FIELDS:
        match = re.search(pattern, comment_text)
        if match:
            found[name] = match.group(1).strip()
    return found


def feature_evidence_complete(comment_text: str) -> bool:
    fields = parse_feature_evidence(comment_text)
    required = {name for name, _ in _FEATURE_FIELDS}
    if set(fields) != required:
        return False
    if fields.get("test_workflow_conclusion", "").lower() != "success":
        return False
    if fields.get("prod_workflow_conclusion", "").lower() != "success":
        return False
    qa = fields.get("qa", "").lower()
    aa = fields.get("aa", "").lower()
    if "pass" not in qa:
        return False
    if "pass" not in aa and "security pass" not in aa:
        return False
    return True
