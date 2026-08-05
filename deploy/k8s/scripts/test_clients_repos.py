"""TDD: clients-repos registry for QA/AA/TA tenant workspace sync (NF + gates)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from clients import (  # noqa: E402
    CLIENTS_REPOS_CURSOR_PATH,
    build_clients_repos_registry,
    clients_repos_registry_json,
)
from persona_bundle import (  # noqa: E402
    build_persona_bundle,
    bundle_for_configmap,
    encode_configmap_key,
)

PERSONAS_ROOT = SCRIPTS.parents[1] / "personas"
ROOT = SCRIPTS.parents[2]


def test_clients_repos_cursor_path():
    assert CLIENTS_REPOS_CURSOR_PATH == ".cursor/clients-repos-registry.json"


def test_build_clients_repos_registry_joins_urls():
    clients = [
        {
            "id": "acme",
            "leantime_client_id": 42,
            "project_id": 7,
            "repo_ids": ["landing-web", "shop-api"],
        }
    ]
    repos = [
        {"id": "landing-web", "git_repo_url": "https://github.com/demo/landing-web.git"},
        {"id": "shop-api", "git_repo_url": "https://github.com/demo/shop-api.git"},
        {"id": "org-wiki", "git_repo_url": "https://github.com/demo/org-wiki.git"},
    ]
    registry = build_clients_repos_registry(clients, repos)
    assert registry["version"] == 1
    assert len(registry["clients"]) == 1
    entry = registry["clients"][0]
    assert entry["leantime_client_id"] == 42
    assert entry["project_id"] == 7
    assert entry["id"] == "acme"
    assert [r["repo_id"] for r in entry["repos"]] == ["landing-web", "shop-api"]
    assert entry["repos"][0]["git_repo_url"].endswith("landing-web.git")
    assert "org-wiki" not in {r["repo_id"] for c in registry["clients"] for r in c["repos"]}


def test_build_clients_repos_registry_requires_known_repo():
    with pytest.raises(ValueError, match="unknown repo_id"):
        build_clients_repos_registry(
            [{"leantime_client_id": 1, "project_id": 1, "repo_ids": ["missing"]}],
            [{"id": "other", "git_repo_url": "https://example.com/other.git"}],
        )


def test_build_clients_repos_registry_empty_clients():
    assert build_clients_repos_registry(None, []) == {"version": 1, "clients": []}


def test_sample_agents_yaml_clients_repos_registry():
    sample = yaml.safe_load((ROOT / "deploy/k8s/agents.yaml.sample").read_text())
    registry = build_clients_repos_registry(sample.get("clients"), sample.get("repos"))
    assert len(registry["clients"]) >= 1
    assert any(
        r["repo_id"] == "landing-web"
        for c in registry["clients"]
        for r in c["repos"]
    )


def test_staff_personas_receive_clients_repos_registry():
    """Mirror render-agents.sh: qa / aa / ta get clients-repos; others do not."""
    sample = yaml.safe_load((ROOT / "deploy/k8s/agents.yaml.sample").read_text())
    reg = clients_repos_registry_json(sample.get("clients"), sample.get("repos"))
    staff = {"qa", "aa", "ta"}
    for persona in ("asky", "qa", "aa", "ta", "pm"):
        bundle = build_persona_bundle(persona, PERSONAS_ROOT)
        if persona in staff:
            bundle[CLIENTS_REPOS_CURSOR_PATH] = reg
        cm_data = bundle_for_configmap(bundle)
        encoded = encode_configmap_key(CLIENTS_REPOS_CURSOR_PATH)
        if persona in staff:
            assert encoded in cm_data
            parsed = json.loads(cm_data[encoded])
            assert parsed["version"] == 1
            assert parsed["clients"]
        else:
            assert encoded not in cm_data


def test_default_bundle_includes_tenant_repo_sync_skill():
    bundle = build_persona_bundle("qa", PERSONAS_ROOT)
    skill_key = ".cursor/skills/tenant-repo-sync/SKILL.md"
    assert skill_key in bundle
    skill = bundle[skill_key]
    assert "clients-repos-registry.json" in skill
    assert "fetch --depth=1" in skill
    assert "reset --hard" in skill
    assert "synced:" in skill


def test_weekly_skills_require_tenant_repo_sync():
    for persona, rel in (
        ("ta", ".cursor/skills/load-weekly/SKILL.md"),
        ("aa", ".cursor/skills/clean-code-weekly/SKILL.md"),
        ("qa", ".cursor/skills/bulk-api-probe/SKILL.md"),
    ):
        bundle = build_persona_bundle(persona, PERSONAS_ROOT)
        body = bundle[rel]
        assert "tenant-repo-sync" in body, rel
        assert "synced:" in body or "sync" in body.lower()


def test_weekly_schedule_success_checks_require_sync_evidence():
    sample = yaml.safe_load((ROOT / "deploy/k8s/agents.yaml.sample").read_text())
    by_id = {s["id"]: s for s in sample["settings"]["schedules"]}
    for sid in ("ta-load-weekly", "aa-clean-weekly", "qa-bulk-weekly"):
        checks = by_id[sid]["success_checks"]
        joined = " ".join(checks).lower()
        assert "sync" in joined or "synced" in joined, sid
        prompt = by_id[sid]["prompt"].lower()
        assert "tenant-repo-sync" in prompt, sid
