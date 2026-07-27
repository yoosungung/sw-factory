"""TDD: top-level repos[] separate from agents (workspace + tenant_cd)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from repos import (  # noqa: E402
    index_repos,
    primary_repo_id,
    resolve_agent_repo,
)
from tenant_cd import (  # noqa: E402
    build_tenant_cd_registry,
    lookup_tenant,
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


def test_index_repos_requires_unique_id():
    with pytest.raises(ValueError, match="duplicate"):
        index_repos(
            [
                {"id": "a", "git_repo_url": "https://x/a.git"},
                {"id": "a", "git_repo_url": "https://x/b.git"},
            ]
        )


def test_resolve_primary_repo_from_repos_list():
    repos = index_repos(
        [{"id": "landing", "git_repo_url": "https://github.com/demo/landing.git"}]
    )
    agent = {"name": "asky", "repos": ["landing"]}
    resolved = resolve_agent_repo(agent, repos, label="agents[0]")
    assert resolved["repo_id"] == "landing"
    assert resolved["git_repo_url"] == "https://github.com/demo/landing.git"
    assert resolved["tenant_cd"] is None


def test_resolve_primary_repo_field():
    repos = index_repos(
        [
            {
                "id": "landing",
                "git_repo_url": "https://github.com/demo/landing.git",
                "tenant_cd": _sample_cd(),
            }
        ]
    )
    agent = {"name": "asky", "primary_repo": "landing"}
    resolved = resolve_agent_repo(agent, repos, label="agents[0]")
    assert resolved["repo_id"] == "landing"
    assert resolved["tenant_cd"]["enabled"] is True


def test_resolve_rejects_mixed_legacy_and_primary():
    repos = index_repos(
        [{"id": "landing", "git_repo_url": "https://github.com/demo/landing.git"}]
    )
    with pytest.raises(ValueError, match="legacy"):
        resolve_agent_repo(
            {
                "name": "asky",
                "primary_repo": "landing",
                "git_repo_url": "https://github.com/demo/other.git",
            },
            repos,
            label="agents[0]",
        )


def test_resolve_legacy_agent_fields():
    resolved = resolve_agent_repo(
        {
            "name": "asky",
            "git_repo_url": "https://github.com/demo/landing.git",
            "tenant_cd": _sample_cd(),
        },
        {},
        label="agents[0]",
    )
    assert resolved["repo_id"] is None
    assert resolved["git_repo_url"] == "https://github.com/demo/landing.git"
    assert resolved["tenant_cd"]["enabled"] is True


def test_build_registry_from_top_level_repos():
    repos = [
        {
            "id": "landing-web",
            "git_repo_url": "https://github.com/demo-org/landing-web.git",
            "tenant_cd": _sample_cd(),
        },
        {"id": "topology", "git_repo_url": "https://github.com/demo-org/topology-lib.git"},
    ]
    agents = [
        {"name": "asky", "primary_repo": "landing-web"},
        {"name": "path", "repos": ["topology"]},
    ]
    registry = build_tenant_cd_registry(agents, repos)
    assert len(registry["tenants"]) == 1
    tenant = registry["tenants"][0]
    assert tenant["agent"] == "asky"
    assert tenant["repo_id"] == "landing-web"
    assert tenant["git_repo_url"].endswith("landing-web.git")
    assert lookup_tenant(registry, repo_id="landing-web")["agent"] == "asky"


def test_build_registry_legacy_still_works():
    agents = [
        {
            "name": "asky",
            "git_repo_url": "https://github.com/demo-org/landing-web.git",
            "tenant_cd": _sample_cd(),
        }
    ]
    registry = build_tenant_cd_registry(agents)
    assert registry["tenants"][0]["agent"] == "asky"
    assert registry["tenants"][0].get("repo_id") is None


def test_agents_yaml_sample_uses_repos_separation():
    root = SCRIPTS.parents[2]
    sample = yaml.safe_load((root / "deploy/k8s/agents.yaml.sample").read_text())
    assert "repos" in sample
    asky = next(a for a in sample["agents"] if a["name"] == "asky")
    assert "tenant_cd" not in asky
    assert primary_repo_id(asky) == "landing-web"
    landing = next(r for r in sample["repos"] if r["id"] == "landing-web")
    assert landing["tenant_cd"]["enabled"] is True
    registry = build_tenant_cd_registry(sample["agents"], sample.get("repos"))
    assert lookup_tenant(registry, agent="asky")["repo_id"] == "landing-web"
    parsed = registry_json(sample["agents"], sample.get("repos"))
    assert "landing-web" in parsed
