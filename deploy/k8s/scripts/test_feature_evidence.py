"""TDD: feature Done evidence (test + qa + aa + prod) M11."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from feature_evidence import (  # noqa: E402
    feature_evidence_complete,
    parse_feature_evidence,
)

_COMPLETE = """
pr_url: https://github.com/demo-org/landing-web/pull/42
merge_sha: abcdef1234567890
test_workflow_run_url: https://github.com/demo-org/landing-web/actions/runs/98
test_workflow_conclusion: success
test_rollout: landing/web OK
test_smoke: HTTP 200 http://web.landing.svc.cluster.local:8080/healthz
qa: e2e pass scenario=checkout evidence=https://example/e2e/1
aa: security pass
prod_workflow_run_url: https://github.com/demo-org/landing-web/actions/runs/99
prod_workflow_conclusion: success
prod_rollout: landing/web OK
prod_smoke: HTTP 200 http://web.landing.svc.cluster.local:8080/healthz
"""


def test_feature_evidence_complete():
    assert feature_evidence_complete(_COMPLETE)
    fields = parse_feature_evidence(_COMPLETE)
    assert fields["qa"].startswith("e2e pass")
    assert fields["aa"].startswith("security pass")
    assert fields["test_workflow_conclusion"] == "success"
    assert fields["prod_workflow_conclusion"] == "success"


def test_feature_evidence_incomplete_without_qa():
    truncated = _COMPLETE.replace(
        "qa: e2e pass scenario=checkout evidence=https://example/e2e/1\n", ""
    )
    assert not feature_evidence_complete(truncated)


def test_feature_evidence_incomplete_without_aa():
    truncated = _COMPLETE.replace("aa: security pass\n", "")
    assert not feature_evidence_complete(truncated)


def test_feature_evidence_rejects_failed_prod():
    failed = _COMPLETE.replace(
        "prod_workflow_conclusion: success", "prod_workflow_conclusion: failure"
    )
    assert not feature_evidence_complete(failed)


def test_legacy_m5_evidence_not_enough_for_feature_done():
    legacy = """
pr_url: https://github.com/demo-org/landing-web/pull/42
merge_sha: abcdef1234567890
workflow_run_url: https://github.com/demo-org/landing-web/actions/runs/99
workflow_conclusion: success
rollout: landing/web OK
smoke: HTTP 200 http://web.landing.svc.cluster.local:8080/healthz
"""
    assert not feature_evidence_complete(legacy)
