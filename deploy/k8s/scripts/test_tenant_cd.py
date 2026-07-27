"""Tests for tenant_cd registry builder (M5)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from tenant_cd import (  # noqa: E402
    REGISTRY_CURSOR_PATH,
    build_tenant_cd_registry,
    evidence_complete,
    lookup_tenant,
    normalize_tenant_cd,
    parse_evidence_fields,
    registry_json,
)


def _sample_cd(**overrides):
    base = {
        "enabled": True,
        "driver": "workflow_dispatch",
        "workflow": "deploy.yml",
        "ref": "main",
        "inputs": {"environment": "production"},
        "image_input": "image_tag",
        "verify": {
            "namespace": "landing",
            "deployment": "web",
            "timeout_sec": 300,
            "smoke": {
                "type": "http",
                "url": "http://web.landing.svc.cluster.local:8080/healthz",
                "expect_status": 200,
            },
        },
    }
    base.update(overrides)
    return base


def test_normalize_skips_when_disabled():
    assert normalize_tenant_cd({"enabled": False}, "t") is None
    assert normalize_tenant_cd(None, "t") is None


def test_normalize_rejects_unknown_driver():
    with pytest.raises(ValueError, match="driver"):
        normalize_tenant_cd(_sample_cd(driver="kubectl_set_image"), "t")


def test_build_registry_shape():
    agents = [
        {
            "name": "asky",
            "git_repo_url": "https://github.com/demo-org/landing-web.git",
            "tenant_cd": _sample_cd(),
        },
        {"name": "path", "git_repo_url": "https://github.com/demo-org/topology-lib.git"},
        {
            "name": "wiki",
            "git_repo_url": "https://github.com/demo-org/wiki.git",
            "tenant_cd": {"enabled": False},
        },
    ]
    registry = build_tenant_cd_registry(agents)
    assert registry["version"] == 1
    assert len(registry["tenants"]) == 1
    tenant = registry["tenants"][0]
    assert tenant["agent"] == "asky"
    assert tenant["tenant_cd"]["driver"] == "workflow_dispatch"
    assert tenant["tenant_cd"]["verify"]["smoke"]["expect_status"] == 200
    assert REGISTRY_CURSOR_PATH == ".cursor/tenant-cd-registry.json"


def test_build_requires_git_repo_when_enabled():
    with pytest.raises(ValueError, match="git_repo_url"):
        build_tenant_cd_registry(
            [{"name": "asky", "git_repo_url": "", "tenant_cd": _sample_cd()}]
        )


def test_lookup_by_agent_and_repo():
    registry = build_tenant_cd_registry(
        [
            {
                "name": "asky",
                "git_repo_url": "https://github.com/demo-org/landing-web.git",
                "tenant_cd": _sample_cd(),
            }
        ]
    )
    assert lookup_tenant(registry, agent="asky")["agent"] == "asky"
    assert (
        lookup_tenant(
            registry, git_repo_url="https://github.com/demo-org/landing-web.git/"
        )["agent"]
        == "asky"
    )
    assert lookup_tenant(registry, agent="path") is None


def test_registry_json_roundtrip():
    agents = [
        {
            "name": "asky",
            "git_repo_url": "https://github.com/demo-org/landing-web.git",
            "tenant_cd": _sample_cd(),
        }
    ]
    parsed = json.loads(registry_json(agents))
    assert parsed["tenants"][0]["tenant_cd"]["workflow"] == "deploy.yml"


def test_agents_yaml_sample_tenant_cd_validates():
    root = SCRIPTS.parents[2]
    sample = root / "deploy/k8s/agents.yaml.sample"
    data = yaml.safe_load(sample.read_text())
    registry = build_tenant_cd_registry(data.get("agents", []), data.get("repos"))
    assert registry["version"] == 1
    enabled = [t["agent"] for t in registry["tenants"]]
    assert "asky" in enabled
    asky = next(t for t in registry["tenants"] if t["agent"] == "asky")
    assert asky["tenant_cd"]["workflow"] == "deploy.yml"
    assert asky.get("repo_id") == "landing-web"


def test_infra_bundle_receives_registry_path():
    """Mirror render-agents.sh: only persona infra gets REGISTRY_CURSOR_PATH."""
    from persona_bundle import build_persona_bundle, bundle_for_configmap

    root = SCRIPTS.parents[2]
    personas_root = root / "deploy/personas"
    sample = yaml.safe_load((root / "deploy/k8s/agents.yaml.sample").read_text())
    reg = registry_json(sample.get("agents", []), sample.get("repos"))

    for persona in ("asky", "infra"):
        bundle = build_persona_bundle(persona, personas_root)
        if persona == "infra":
            bundle[REGISTRY_CURSOR_PATH] = reg
        cm_data = bundle_for_configmap(bundle)
        encoded = REGISTRY_CURSOR_PATH.replace("/", "__")
        if encoded.startswith("."):
            encoded = "_dot_" + encoded[1:]
        if persona == "infra":
            assert encoded in cm_data
            parsed = json.loads(cm_data[encoded])
            assert parsed["tenants"][0]["agent"] == "asky"
        else:
            assert encoded not in cm_data


_COMPLETE_EVIDENCE = """
tenant_cd evidence
pr_url: https://github.com/demo-org/landing-web/pull/42
merge_sha: abcdef1234567890
workflow_run_url: https://github.com/demo-org/landing-web/actions/runs/99
workflow_conclusion: success
rollout: landing/web OK
smoke: HTTP 200 http://web.landing.svc.cluster.local:8080/healthz
agent: asky
"""


def test_evidence_complete_for_done_gate():
    assert evidence_complete(_COMPLETE_EVIDENCE)
    fields = parse_evidence_fields(_COMPLETE_EVIDENCE)
    assert fields["workflow_conclusion"] == "success"
    assert "landing/web OK" in fields["rollout"]


def test_evidence_incomplete_without_smoke():
    truncated = _COMPLETE_EVIDENCE.replace(
        "smoke: HTTP 200 http://web.landing.svc.cluster.local:8080/healthz\n",
        "",
    )
    assert not evidence_complete(truncated)


def test_evidence_rejects_failed_workflow():
    failed = _COMPLETE_EVIDENCE.replace(
        "workflow_conclusion: success", "workflow_conclusion: failure"
    )
    assert not evidence_complete(failed)


def test_framework_e2e_chain_sample_to_skill_to_evidence():
    """Factory-side E2E without cluster: sample → registry → infra skill → Done gate."""
    from persona_bundle import build_persona_bundle

    root = SCRIPTS.parents[2]
    sample = yaml.safe_load((root / "deploy/k8s/agents.yaml.sample").read_text())
    registry = build_tenant_cd_registry(sample["agents"], sample.get("repos"))
    tenant = lookup_tenant(registry, agent="asky")
    assert tenant is not None
    assert tenant["tenant_cd"]["driver"] == "workflow_dispatch"
    assert tenant.get("repo_id") == "landing-web"

    bundle = build_persona_bundle("infra", root / "deploy/personas")
    assert ".cursor/skills/tenant-cd/SKILL.md" in bundle
    assert ".cursor/skills/tenant-cd/references/dispatch.md" in bundle
    assert "workflow_dispatch" in bundle[".cursor/skills/tenant-cd/SKILL.md"]

    example = (
        root / "examples/tenant-cd/workflow-dispatch/deploy.yml"
    ).read_text()
    assert "workflow_dispatch" in example
    assert "image_tag" in example

    assert evidence_complete(_COMPLETE_EVIDENCE)
