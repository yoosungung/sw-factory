"""Resolve top-level repos[] vs legacy agents[].git_repo_url / tenant_cd."""

from __future__ import annotations

from typing import Any


def _require_str(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def index_repos(repos: list[object] | None) -> dict[str, dict[str, Any]]:
    """Build id → repo object map. Empty/None → {}."""
    if not repos:
        return {}
    if not isinstance(repos, list):
        raise ValueError("repos must be a list")
    out: dict[str, dict[str, Any]] = {}
    for i, raw in enumerate(repos):
        if not isinstance(raw, dict):
            raise ValueError(f"repos[{i}] must be an object")
        repo_id = _require_str(raw.get("id"), f"repos[{i}].id")
        if repo_id in out:
            raise ValueError(f"repos: duplicate id {repo_id!r}")
        git_repo = _require_str(raw.get("git_repo_url"), f"repos[{i}].git_repo_url")
        entry = dict(raw)
        entry["id"] = repo_id
        entry["git_repo_url"] = git_repo
        out[repo_id] = entry
    return out


def primary_repo_id(agent: dict[str, Any]) -> str | None:
    """Return primary repo id from primary_repo or repos[0], else None."""
    if agent.get("primary_repo") is not None and str(agent.get("primary_repo")).strip():
        return str(agent["primary_repo"]).strip()
    repos = agent.get("repos")
    if isinstance(repos, list) and repos:
        first = repos[0]
        if isinstance(first, str) and first.strip():
            return first.strip()
    return None


def _has_legacy_repo_fields(agent: dict[str, Any]) -> bool:
    if agent.get("tenant_cd") is not None:
        return True
    url = agent.get("git_repo_url")
    return url is not None and str(url).strip() != ""


def resolve_agent_repo(
    agent: dict[str, Any],
    repos_by_id: dict[str, dict[str, Any]],
    *,
    label: str = "agent",
) -> dict[str, Any]:
    """Resolve clone URL + optional tenant_cd for one agent.

    New shape: agent.primary_repo / agent.repos[0] → repos[id].
    Legacy: agent.git_repo_url + agent.tenant_cd.
    Mixing both shapes raises.
    """
    repo_id = primary_repo_id(agent)
    legacy = _has_legacy_repo_fields(agent)

    if repo_id is not None and legacy:
        raise ValueError(
            f"{label}: cannot mix primary_repo/repos with legacy "
            "git_repo_url/tenant_cd"
        )

    if repo_id is not None:
        if repo_id not in repos_by_id:
            raise ValueError(f"{label}: unknown primary_repo {repo_id!r}")
        repo = repos_by_id[repo_id]
        return {
            "repo_id": repo_id,
            "git_repo_url": str(repo["git_repo_url"]),
            "tenant_cd": repo.get("tenant_cd"),
        }

    return {
        "repo_id": None,
        "git_repo_url": str(agent.get("git_repo_url") or "").strip(),
        "tenant_cd": agent.get("tenant_cd"),
    }
