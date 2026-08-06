"""Build and validate repos[].roadmap registry for PM sync."""

from __future__ import annotations

import json
from typing import Any

from clients import index_clients
from repos import index_repos

REGISTRY_VERSION = 1
REGISTRY_CURSOR_PATH = ".cursor/roadmap-registry.json"
DEFAULT_PATH = "ROADMAP.md"


def _require_str(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def normalize_roadmap(raw: object, label: str) -> dict[str, Any] | None:
    """Validate repos[].roadmap. enabled!=true → None (skip)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError(f"{label} must be an object")
    if raw.get("enabled") is not True:
        return None
    path = raw.get("path")
    if path is None:
        path_str = DEFAULT_PATH
    else:
        path_str = _require_str(path, f"{label}.path")
    return {"enabled": True, "path": path_str}


def build_roadmap_registry(
    clients: list[object] | None,
    repos: list[object] | None,
) -> dict[str, Any]:
    """Collect enabled roadmap repos joined to client project_id."""
    repos_by_id = index_repos(repos)
    by_client, repo_to_client = index_clients(clients)
    out: list[dict[str, Any]] = []
    for repo_id, repo in sorted(repos_by_id.items()):
        label = f"repos[{repo_id}].roadmap"
        rm = normalize_roadmap(repo.get("roadmap"), label)
        if rm is None:
            continue
        if repo_id not in repo_to_client:
            raise ValueError(
                f"{label}: enabled but {repo_id!r} is not in any clients[].repo_ids"
            )
        cid = repo_to_client[repo_id]
        client = by_client[cid]
        entry: dict[str, Any] = {
            "repo_id": repo_id,
            "git_repo_url": str(repo["git_repo_url"]),
            "path": rm["path"],
            "project_id": client["project_id"],
            "leantime_client_id": cid,
        }
        if client.get("id"):
            entry["client_id"] = client["id"]
        out.append(entry)
    return {"version": REGISTRY_VERSION, "repos": out}


def roadmap_registry_json(
    clients: list[object] | None,
    repos: list[object] | None,
) -> str:
    """Pretty JSON for persona ConfigMap seed."""
    return json.dumps(build_roadmap_registry(clients, repos), indent=2) + "\n"
