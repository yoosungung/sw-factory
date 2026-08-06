"""TDD: repos[].roadmap registry for PM ROADMAP sync."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from roadmap import (  # noqa: E402
    DEFAULT_PATH,
    REGISTRY_CURSOR_PATH,
    REGISTRY_VERSION,
    build_roadmap_registry,
    normalize_roadmap,
    roadmap_registry_json,
)


def test_cursor_path():
    assert REGISTRY_CURSOR_PATH == ".cursor/roadmap-registry.json"


def test_normalize_skips_when_disabled():
    assert normalize_roadmap(None, "t") is None
    assert normalize_roadmap({"enabled": False}, "t") is None
    assert normalize_roadmap({"enabled": True}, "t") == {
        "enabled": True,
        "path": DEFAULT_PATH,
    }


def test_normalize_custom_path():
    assert normalize_roadmap(
        {"enabled": True, "path": "docs/ROADMAP.md"}, "t"
    ) == {"enabled": True, "path": "docs/ROADMAP.md"}


def test_normalize_rejects_empty_path():
    with pytest.raises(ValueError, match="path"):
        normalize_roadmap({"enabled": True, "path": "  "}, "t")


def test_build_requires_client_membership():
    repos = [
        {
            "id": "orphan",
            "git_repo_url": "https://github.com/demo/orphan.git",
            "roadmap": {"enabled": True},
        }
    ]
    with pytest.raises(ValueError, match="repo_ids"):
        build_roadmap_registry(
            [{"leantime_client_id": 1, "project_id": 1, "repo_ids": ["other"]}],
            repos,
        )


def test_build_registry_shape():
    clients = [
        {
            "id": "demo-acme",
            "leantime_client_id": 1,
            "project_id": 9,
            "repo_ids": ["landing-web", "shop-api"],
        }
    ]
    repos = [
        {
            "id": "landing-web",
            "git_repo_url": "https://github.com/demo/landing-web.git",
            "roadmap": {"enabled": True, "path": "ROADMAP.md"},
        },
        {
            "id": "shop-api",
            "git_repo_url": "https://github.com/demo/shop-api.git",
        },
        {
            "id": "other",
            "git_repo_url": "https://github.com/demo/other.git",
            "roadmap": {"enabled": False},
        },
    ]
    registry = build_roadmap_registry(clients, repos)
    assert registry["version"] == REGISTRY_VERSION
    assert len(registry["repos"]) == 1
    entry = registry["repos"][0]
    assert entry == {
        "repo_id": "landing-web",
        "git_repo_url": "https://github.com/demo/landing-web.git",
        "path": "ROADMAP.md",
        "project_id": 9,
        "leantime_client_id": 1,
        "client_id": "demo-acme",
    }


def test_roadmap_registry_json_pretty():
    clients = [
        {"leantime_client_id": 5, "project_id": 8, "repo_ids": ["codingland"]}
    ]
    repos = [
        {
            "id": "codingland",
            "git_repo_url": "https://github.com/demo/codingland.git",
            "roadmap": {"enabled": True},
        }
    ]
    text = roadmap_registry_json(clients, repos)
    assert text.endswith("\n")
    assert '"repo_id": "codingland"' in text
    assert f'"path": "{DEFAULT_PATH}"' in text


def test_sample_agents_yaml_roadmap_opt_in():
    sample = yaml.safe_load(
        (SCRIPTS.parent / "agents.yaml.sample").read_text()
    )
    registry = build_roadmap_registry(sample.get("clients"), sample.get("repos"))
    assert registry["version"] == REGISTRY_VERSION
    by_id = {e["repo_id"]: e for e in registry["repos"]}
    assert "landing-web" in by_id
    assert by_id["landing-web"]["path"] == "ROADMAP.md"
    assert by_id["landing-web"]["project_id"] == 1
