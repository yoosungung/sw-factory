#!/usr/bin/env python3
"""Sync deploy/k8s/agents.yaml → leantime-plugin/bridge.json"""

from __future__ import annotations

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
AGENTS_YAML = ROOT / "deploy" / "k8s" / "agents.yaml"
BRIDGE_JSON = ROOT / "leantime-plugin" / "bridge.json"

PROMPTS = {
    "ticket_created": (
        "New ticket assigned. Use Leantime MCP: get_ticket + get_comments, then plan. "
        "When implementation is ready for review, follow git-ship (push + PR) before Leantime handoff."
    ),
    "ticket_updated": (
        "Ticket updated. Re-read context via MCP and continue or hand off with add_comment. "
        "Review handoff requires pushed commits and an open PR (git-ship skill)."
    ),
    "comment_added": "New comment on ticket. Read comments and respond with add_comment if needed.",
    "assignee_changed": (
        "Assignee changed. If handing off for review: git-ship first (commit, push, PR), "
        "then add_comment with PR link and assign reviewer."
    ),
    "mention": "You were @mentioned on ticket {ticket_id}. Read context and respond.",
    "handoff": (
        "Assignee handoff. If work is ready for review: complete git-ship (push + PR), "
        "set ticket to Review, assign human reviewer, add_comment with PR link. "
        "Do not ask humans to push. Then stop until reassigned."
    ),
}

STATUS_PROMPTS = {
    "3": "Status is In Progress. Continue implementation.",
    "4": (
        "Status is Review. Ensure commits are pushed and PR is open (git-ship). "
        "Summarize changes for reviewer with PR link; do not ask anyone to push locally. "
        "After merge on a tenant_cd-enabled repo: hand off to infra with merge_sha "
        "(deploy/smoke evidence required before Done)."
    ),
    "5": (
        "Status is Done. Close out only when required evidence is present: "
        "for tenant_cd tickets require pr_url, merge_sha, workflow_run_url+"
        "workflow_conclusion=success, rollout OK, and smoke HTTP result."
    ),
}

DEFAULT_MODEL = "composer-2.5"
VALID_TYPES = frozenset({"human", "sessions", "openai"})


def agent_type(agent: dict) -> str:
    """Normalize agents[].type (human | sessions | openai)."""
    raw = str(agent.get("type") or "").strip().lower()
    if raw not in VALID_TYPES:
        name = agent.get("name", "?")
        raise ValueError(
            f"agent {name!r} type must be one of {sorted(VALID_TYPES)}, got {raw!r}"
        )
    return raw


def agent_model(agent: dict, settings: dict) -> str:
    """Resolve model for a sessions agent: agent.model → settings.model → default."""
    return str(agent.get("model") or settings.get("model") or DEFAULT_MODEL)


def runner_url_for(agent: dict) -> str:
    """Resolve runner_url from type: human→""; sessions→cursor-agent DNS; openai→YAML required."""
    kind = agent_type(agent)
    if kind == "human":
        return ""
    if kind == "sessions":
        name = agent["name"]
        return f"http://cursor-agent-{name}.leantime.svc:8080"
    url = str(agent.get("runner_url") or "").strip()
    if not url:
        raise ValueError(
            f"agent {agent.get('name', '?')!r} type=openai requires non-empty runner_url"
        )
    return url.rstrip("/")


def normalize_schedules(raw: object) -> list[dict]:
    """Validate and normalize settings.schedules for bridge.json."""
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("settings.schedules must be a list")
    out: list[dict] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ValueError(f"settings.schedules[{i}] must be an object")
        schedule_id = str(item.get("id") or "").strip()
        cron = str(item.get("cron") or "").strip()
        prompt = str(item.get("prompt") or "").strip()
        if not schedule_id or not cron or not prompt:
            raise ValueError(
                f"settings.schedules[{i}] requires non-empty id, cron, prompt"
            )
        entry: dict = {"id": schedule_id, "cron": cron, "prompt": prompt}
        agents = item.get("agents")
        if agents is not None:
            if not isinstance(agents, list) or not all(
                isinstance(a, str) and a.strip() for a in agents
            ):
                raise ValueError(
                    f"settings.schedules[{i}].agents must be a list of names"
                )
            entry["agents"] = [a.strip() for a in agents]
        checks = item.get("success_checks")
        if checks is not None:
            entry["success_checks"] = normalize_success_checks(
                checks, f"settings.schedules[{i}].success_checks"
            )
        gates = item.get("gates")
        if gates is not None:
            normalized_gates = normalize_schedule_gates(
                gates, f"settings.schedules[{i}].gates"
            )
            if normalized_gates:
                entry["gates"] = normalized_gates
        out.append(entry)
    return out


KNOWN_SCHEDULE_GATES = frozenset({"in_progress"})


def normalize_schedule_gates(raw: object, label: str) -> list[str]:
    """Validate optional schedules[].gates (omit/[] = no gates)."""
    if not isinstance(raw, list) or not all(
        isinstance(item, str) and item.strip() for item in raw
    ):
        raise ValueError(f"{label} must be a list of non-empty strings")
    gates = [item.strip() for item in raw]
    unknown = sorted(set(gates) - KNOWN_SCHEDULE_GATES)
    if unknown:
        raise ValueError(
            f"{label} has unknown gate(s): {', '.join(unknown)}; "
            f"known: {', '.join(sorted(KNOWN_SCHEDULE_GATES))}"
        )
    return gates


def normalize_success_checks(raw: object, label: str) -> list[str]:
    """Validate optional success_checks string list."""
    if not isinstance(raw, list) or not all(
        isinstance(item, str) and item.strip() for item in raw
    ):
        raise ValueError(f"{label} must be a list of non-empty strings")
    return [item.strip() for item in raw]


def normalize_budget(raw: object) -> dict | None:
    """Validate optional run budget (soft wall-time limit)."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("settings.budget must be an object")
    out: dict = {}
    timeout_ms = raw.get("timeout_ms")
    if timeout_ms is not None:
        if isinstance(timeout_ms, bool) or not isinstance(timeout_ms, (int, float)):
            raise ValueError("settings.budget.timeout_ms must be a number")
        out["timeout_ms"] = int(timeout_ms)
    return out or None


def normalize_success_retry(raw: object) -> dict | None:
    """Validate optional success-check retry cap for verified runs."""
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValueError("settings.success_retry must be an object")
    max_attempts = raw.get("max_attempts")
    if max_attempts is None:
        return None
    if (
        isinstance(max_attempts, bool)
        or not isinstance(max_attempts, int)
        or max_attempts < 0
    ):
        raise ValueError("settings.success_retry.max_attempts must be a non-negative int")
    return {"max_attempts": max_attempts}


def main() -> None:
    data = yaml.safe_load(AGENTS_YAML.read_text())
    settings = data.get("settings", {})
    agents_out = []
    for agent in data.get("agents", []):
        kind = agent_type(agent)
        entry = {
            "name": agent["name"],
            "leantime_user_id": agent["leantime_user_id"],
            "email": agent["email"],
            "runner_url": runner_url_for(agent),
            "git_repo_url": agent.get("git_repo_url", ""),
            "persona": agent.get("persona", agent["name"]),
            "type": kind,
        }
        if kind == "sessions":
            entry["model"] = agent_model(agent, settings)
        agents_out.append(entry)

    bridge = {
        "debounce_ms": int(settings.get("debounce_ms", 3000)),
        "mention_routing": bool(settings.get("mention_routing", True)),
        "model": str(settings.get("model") or DEFAULT_MODEL),
        "agents": agents_out,
        "prompts": PROMPTS,
        "status_prompts": STATUS_PROMPTS,
        "schedules": normalize_schedules(settings.get("schedules", [])),
    }
    if "success_checks" in settings:
        bridge["success_checks"] = normalize_success_checks(
            settings.get("success_checks"), "settings.success_checks"
        )
    budget = normalize_budget(settings.get("budget"))
    if budget is not None:
        bridge["budget"] = budget
    success_retry = normalize_success_retry(settings.get("success_retry"))
    if success_retry is not None:
        bridge["success_retry"] = success_retry
    BRIDGE_JSON.write_text(json.dumps(bridge, indent=2) + "\n")
    print(f"Wrote {BRIDGE_JSON}")


if __name__ == "__main__":
    main()
