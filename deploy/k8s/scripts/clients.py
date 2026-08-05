"""clients[] ≡ Leantime client_id; dual-loop status board (M11)."""

from __future__ import annotations

import json
from typing import Any

from repos import index_repos

CLIENTS_REPOS_VERSION = 1
CLIENTS_REPOS_CURSOR_PATH = ".cursor/clients-repos-registry.json"

LOOP_STATUS_NAMES: tuple[str, ...] = (
    "New",
    "In Progress",
    "Review",
    "Deploying Test",
    "QA",
    "Deploying Prod",
    "Done",
    "Blocked",
    "Waiting for Approval",
)


def _require_int(value: object, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{label} must be an int")
    return value


def _require_str(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def validate_status_board(board: object, label: str = "status_board") -> dict[str, int]:
    if not isinstance(board, dict):
        raise ValueError(f"{label} must be an object")
    out: dict[str, int] = {}
    missing = []
    for name in LOOP_STATUS_NAMES:
        if name not in board:
            missing.append(name)
            continue
        out[name] = _require_int(board[name], f"{label}.{name}")
    if missing:
        raise ValueError(f"{label} missing statuses: {', '.join(missing)}")
    return out


def index_clients(
    clients: list[object] | None,
) -> tuple[dict[int, dict[str, Any]], dict[str, int]]:
    """Return (by_leantime_client_id, repo_id → client_id)."""
    if not clients:
        return {}, {}
    if not isinstance(clients, list):
        raise ValueError("clients must be a list")
    by_id: dict[int, dict[str, Any]] = {}
    repo_to_client: dict[str, int] = {}
    for i, raw in enumerate(clients):
        if not isinstance(raw, dict):
            raise ValueError(f"clients[{i}] must be an object")
        cid = _require_int(
            raw.get("leantime_client_id"), f"clients[{i}].leantime_client_id"
        )
        if cid in by_id:
            raise ValueError(f"clients: duplicate leantime_client_id {cid}")
        project_id = _require_int(raw.get("project_id"), f"clients[{i}].project_id")
        repo_ids_raw = raw.get("repo_ids") or []
        if not isinstance(repo_ids_raw, list) or not repo_ids_raw:
            raise ValueError(f"clients[{i}].repo_ids must be a non-empty list")
        repo_ids: list[str] = []
        for j, rid in enumerate(repo_ids_raw):
            repo_ids.append(_require_str(rid, f"clients[{i}].repo_ids[{j}]"))
        entry: dict[str, Any] = {
            "leantime_client_id": cid,
            "project_id": project_id,
            "repo_ids": repo_ids,
        }
        if raw.get("id") is not None:
            entry["id"] = _require_str(raw.get("id"), f"clients[{i}].id")
        if raw.get("status_map") is not None:
            entry["status_map"] = validate_status_board(
                raw["status_map"], f"clients[{i}].status_map"
            )
        by_id[cid] = entry
        for rid in repo_ids:
            if rid in repo_to_client:
                raise ValueError(f"clients: repo_id {rid!r} owned by multiple clients")
            repo_to_client[rid] = cid
    return by_id, repo_to_client


def resolve_status_id(
    name: str,
    *,
    client: dict[str, Any] | None = None,
    default_board: dict[str, int] | None = None,
) -> int:
    """Map dual-loop status name → Leantime numeric id."""
    if name not in LOOP_STATUS_NAMES:
        raise ValueError(f"unknown status name {name!r}")
    if client and isinstance(client.get("status_map"), dict):
        sm = client["status_map"]
        if name in sm:
            return int(sm[name])
    if default_board and name in default_board:
        return int(default_board[name])
    raise ValueError(f"no status id for {name!r}")


def build_clients_repos_registry(
    clients: list[object] | None,
    repos: list[object] | None = None,
) -> dict[str, Any]:
    """Join clients[] + repos[] for staff NF/gate discovery (no tenant_cd required)."""
    by_id, _repo_to_client = index_clients(clients)
    repos_by_id = index_repos(repos)
    out_clients: list[dict[str, Any]] = []
    for cid in sorted(by_id):
        client = by_id[cid]
        repo_entries: list[dict[str, str]] = []
        for repo_id in client["repo_ids"]:
            if repo_id not in repos_by_id:
                raise ValueError(
                    f"clients leantime_client_id={cid}: unknown repo_id {repo_id!r}"
                )
            repo_entries.append(
                {
                    "repo_id": repo_id,
                    "git_repo_url": repos_by_id[repo_id]["git_repo_url"],
                }
            )
        entry: dict[str, Any] = {
            "leantime_client_id": cid,
            "project_id": client["project_id"],
            "repos": repo_entries,
        }
        if client.get("id"):
            entry["id"] = client["id"]
        out_clients.append(entry)
    return {"version": CLIENTS_REPOS_VERSION, "clients": out_clients}


def clients_repos_registry_json(
    clients: list[object] | None,
    repos: list[object] | None = None,
) -> str:
    """Pretty JSON for persona ConfigMap seed."""
    return json.dumps(build_clients_repos_registry(clients, repos), indent=2) + "\n"
