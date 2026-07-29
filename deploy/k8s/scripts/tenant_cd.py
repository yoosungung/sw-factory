"""Build and validate tenant_cd registry from agents.yaml (M5/M11)."""

from __future__ import annotations

import json
import re
from typing import Any

from clients import index_clients
from repos import index_repos, resolve_agent_repo

REGISTRY_VERSION = 2
REGISTRY_CURSOR_PATH = ".cursor/tenant-cd-registry.json"
ALLOWED_DRIVERS = frozenset({"workflow_dispatch"})
ALLOWED_SMOKE_TYPES = frozenset({"http"})
ALLOWED_ENVIRONMENTS = frozenset({"test", "production"})


def _require_str(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def normalize_tenant_cd(raw: object, label: str) -> dict[str, Any] | None:
    """Validate repos[].tenant_cd (or legacy agents[].tenant_cd)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError(f"{label} must be an object")
    if raw.get("enabled") is not True:
        return None

    driver = _require_str(raw.get("driver"), f"{label}.driver")
    if driver not in ALLOWED_DRIVERS:
        raise ValueError(
            f"{label}.driver must be one of {sorted(ALLOWED_DRIVERS)}, got {driver!r}"
        )
    workflow = _require_str(raw.get("workflow"), f"{label}.workflow")
    ref = _require_str(raw.get("ref") or "main", f"{label}.ref")
    image_input = _require_str(
        raw.get("image_input") or "image_tag", f"{label}.image_input"
    )

    inputs_raw = raw.get("inputs")
    inputs: dict[str, str] = {}
    if inputs_raw is not None:
        if not isinstance(inputs_raw, dict):
            raise ValueError(f"{label}.inputs must be an object")
        for key, val in inputs_raw.items():
            k = _require_str(str(key), f"{label}.inputs key")
            if not isinstance(val, (str, int, float)) or isinstance(val, bool):
                raise ValueError(f"{label}.inputs.{k} must be a string or number")
            inputs[k] = str(val)

    env = inputs.get("environment", "test")
    if env not in ALLOWED_ENVIRONMENTS:
        raise ValueError(
            f"{label}.inputs.environment must be one of "
            f"{sorted(ALLOWED_ENVIRONMENTS)}, got {env!r}"
        )
    inputs["environment"] = env

    verify_raw = raw.get("verify")
    if not isinstance(verify_raw, dict):
        raise ValueError(f"{label}.verify must be an object")
    namespace = _require_str(verify_raw.get("namespace"), f"{label}.verify.namespace")
    deployment = _require_str(
        verify_raw.get("deployment"), f"{label}.verify.deployment"
    )
    timeout = verify_raw.get("timeout_sec", 300)
    if isinstance(timeout, bool) or not isinstance(timeout, (int, float)):
        raise ValueError(f"{label}.verify.timeout_sec must be a number")
    timeout_sec = int(timeout)
    if timeout_sec <= 0:
        raise ValueError(f"{label}.verify.timeout_sec must be positive")

    smoke_raw = verify_raw.get("smoke")
    if not isinstance(smoke_raw, dict):
        raise ValueError(f"{label}.verify.smoke must be an object")
    smoke_type = _require_str(smoke_raw.get("type"), f"{label}.verify.smoke.type")
    if smoke_type not in ALLOWED_SMOKE_TYPES:
        raise ValueError(
            f"{label}.verify.smoke.type must be one of {sorted(ALLOWED_SMOKE_TYPES)}"
        )
    smoke_url = _require_str(smoke_raw.get("url"), f"{label}.verify.smoke.url")
    expect = smoke_raw.get("expect_status", 200)
    if isinstance(expect, bool) or not isinstance(expect, int):
        raise ValueError(f"{label}.verify.smoke.expect_status must be an int")

    return {
        "enabled": True,
        "driver": driver,
        "workflow": workflow,
        "ref": ref,
        "inputs": inputs,
        "image_input": image_input,
        "verify": {
            "namespace": namespace,
            "deployment": deployment,
            "timeout_sec": timeout_sec,
            "smoke": {
                "type": smoke_type,
                "url": smoke_url,
                "expect_status": expect,
            },
        },
    }


def build_tenant_cd_registry(
    agents: list[dict],
    repos: list[dict] | None = None,
    clients: list[dict] | None = None,
) -> dict[str, Any]:
    """Collect enabled tenant_cd entries keyed for TA lookup (client_id + repo)."""
    repos_by_id = index_repos(repos)
    _by_client, repo_to_client = index_clients(clients)
    tenants: list[dict[str, Any]] = []
    for i, agent in enumerate(agents):
        if not isinstance(agent, dict):
            raise ValueError(f"agents[{i}] must be an object")
        name = _require_str(agent.get("name"), f"agents[{i}].name")
        label = f"agents[{i}] ({name})"
        resolved = resolve_agent_repo(agent, repos_by_id, label=label)
        cd_label = (
            f"repos[{resolved['repo_id']}].tenant_cd"
            if resolved["repo_id"]
            else f"{label}.tenant_cd"
        )
        cd = normalize_tenant_cd(resolved.get("tenant_cd"), cd_label)
        if cd is None:
            continue
        git_repo = str(resolved.get("git_repo_url") or "").strip()
        if not git_repo:
            raise ValueError(
                f"{label}: tenant_cd.enabled requires non-empty git_repo_url"
            )
        entry: dict[str, Any] = {
            "agent": name,
            "git_repo_url": git_repo,
            "tenant_cd": cd,
        }
        repo_id = resolved.get("repo_id")
        if repo_id:
            entry["repo_id"] = repo_id
            if repo_id in repo_to_client:
                entry["client_id"] = repo_to_client[repo_id]
            elif clients:
                raise ValueError(
                    f"{label}: repos[{repo_id}] has tenant_cd but is not in any "
                    "clients[].repo_ids (tenant ≡ client_id)"
                )
        tenants.append(entry)
    return {"version": REGISTRY_VERSION, "tenants": tenants}


def registry_json(
    agents: list[dict],
    repos: list[dict] | None = None,
    clients: list[dict] | None = None,
) -> str:
    """Pretty JSON for ConfigMap / file seed."""
    return (
        json.dumps(build_tenant_cd_registry(agents, repos, clients), indent=2) + "\n"
    )


def lookup_tenant(
    registry: dict[str, Any],
    *,
    agent: str | None = None,
    git_repo_url: str | None = None,
    repo_id: str | None = None,
    client_id: int | None = None,
) -> dict[str, Any] | None:
    """Find a tenant entry by client_id+repo, repo_id, agent, or git_repo_url."""
    tenants = registry.get("tenants") or []
    if client_id is not None and repo_id:
        rid = repo_id.strip().lower()
        for item in tenants:
            if (
                item.get("client_id") == client_id
                and str(item.get("repo_id", "")).strip().lower() == rid
            ):
                return item
    if client_id is not None and not repo_id:
        matches = [t for t in tenants if t.get("client_id") == client_id]
        if len(matches) == 1:
            return matches[0]
    if repo_id:
        key = repo_id.strip().lower()
        for item in tenants:
            if str(item.get("repo_id", "")).strip().lower() == key:
                return item
    if agent:
        key = agent.strip().lower()
        for item in tenants:
            if str(item.get("agent", "")).strip().lower() == key:
                return item
    if git_repo_url:
        repo = git_repo_url.strip().rstrip("/").lower()
        for item in tenants:
            if str(item.get("git_repo_url", "")).strip().rstrip("/").lower() == repo:
                return item
    return None


# Legacy M5 single-env evidence (still used by older comments / tests)
_EVIDENCE_REQUIRED = (
    ("pr_url", r"(?im)^\s*pr_url:\s*(\S+)"),
    ("merge_sha", r"(?im)^\s*merge_sha:\s*(\S+)"),
    ("workflow_run_url", r"(?im)^\s*workflow_run_url:\s*(\S+)"),
    ("workflow_conclusion", r"(?im)^\s*workflow_conclusion:\s*(\S+)"),
    ("rollout", r"(?im)^\s*rollout:\s*(.+\bOK\b.*)"),
    ("smoke", r"(?im)^\s*smoke:\s*(HTTP\s+\d+\s+\S+)"),
)


def parse_evidence_fields(comment_text: str) -> dict[str, str]:
    """Extract legacy tenant_cd evidence fields from a Leantime comment body."""
    found: dict[str, str] = {}
    for name, pattern in _EVIDENCE_REQUIRED:
        match = re.search(pattern, comment_text)
        if match:
            found[name] = match.group(1).strip()
    return found


def evidence_complete(comment_text: str) -> bool:
    """True when all legacy Done-gate fields are present and workflow succeeded."""
    fields = parse_evidence_fields(comment_text)
    required = {name for name, _ in _EVIDENCE_REQUIRED}
    if set(fields) != required:
        return False
    return fields.get("workflow_conclusion", "").lower() == "success"
