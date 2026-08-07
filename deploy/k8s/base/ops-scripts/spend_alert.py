#!/usr/bin/env python3
"""Alert when shared CURSOR_API_KEY usage from agent-runner logs exceeds a threshold.

Reads kubectl log text (stdin or --logs-file), sums run.completed usage tokens,
and optionally creates a Leantime ticket in the factory project.

Ticket targets are resolved by **name** at runtime (Leantime API or AGENTS_YAML).
Do not bake numeric project/user ids into CronJob manifests.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_TOKENS_PER_CLIENT = 20_000_000
DEFAULT_THRESHOLD = DEFAULT_TOKENS_PER_CLIENT  # legacy alias: 1 client × 20M
DEFAULT_PROJECT_NAME = "sw-factory"
DEFAULT_AUTHOR_AGENT = "ta"
DEFAULT_ASSIGNEE_AGENT = "eric"
DEFAULT_URL = "http://leantime.sw-factory.svc"


def extract_usage_tokens(usage: dict[str, Any] | None) -> tuple[int, int]:
    if not isinstance(usage, dict):
        return 0, 0
    inp = usage.get("inputTokens", usage.get("input_tokens", 0))
    out = usage.get("outputTokens", usage.get("output_tokens", 0))
    try:
        return int(inp or 0), int(out or 0)
    except (TypeError, ValueError):
        return 0, 0


def sum_run_completed_usage(log_text: str) -> dict[str, Any]:
    input_tokens = 0
    output_tokens = 0
    runs = 0
    by_agent: dict[str, int] = {}
    for line in log_text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip optional kubectl/prefix noise before first '{'
        brace = line.find("{")
        if brace < 0:
            continue
        try:
            obj = json.loads(line[brace:])
        except json.JSONDecodeError:
            continue
        if obj.get("event") != "run.completed":
            continue
        inp, out = extract_usage_tokens(obj.get("usage"))
        if inp == 0 and out == 0:
            continue
        runs += 1
        input_tokens += inp
        output_tokens += out
        agent = str(obj.get("agent_id") or "unknown")
        by_agent[agent] = by_agent.get(agent, 0) + inp + out
    return {
        "runs": runs,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "by_agent": by_agent,
    }


def should_alert(total_tokens: int, threshold: int) -> bool:
    return total_tokens >= threshold


def ticket_headline(summary: dict[str, Any], threshold: int) -> str:
    return (
        f"[Spend alert] CURSOR_API_KEY usage {summary['total_tokens']} "
        f"tokens (threshold {threshold})"
    )


def ticket_description(
    summary: dict[str, Any],
    *,
    threshold: int,
    window: str,
    client_count: int | None = None,
    tokens_per_client: int | None = None,
) -> str:
    lines = [
        "## CURSOR_API_KEY spend alert",
        f"window: {window}",
        f"threshold_tokens: {threshold}",
    ]
    if client_count is not None:
        lines.append(f"client_count: {client_count}")
    if tokens_per_client is not None:
        lines.append(f"tokens_per_client: {tokens_per_client}")
    lines.extend(
        [
            f"total_tokens: {summary['total_tokens']}",
            f"input_tokens: {summary['input_tokens']}",
            f"output_tokens: {summary['output_tokens']}",
            f"runs_with_usage: {summary['runs']}",
            "",
            "### by_agent",
        ]
    )
    for agent, tokens in sorted(summary.get("by_agent", {}).items()):
        lines.append(f"- {agent}: {tokens}")
    lines.extend(
        [
            "",
            "Source: agent-runner `run.completed` usage in kubectl logs.",
            "Shared Secret `cursor-api-key` / CURSOR_API_KEY pool.",
        ]
    )
    return "\n".join(lines)


def html_description(text: str) -> str:
    return html.escape(text).replace("\n", "<br>\n")


def load_leantime_env() -> dict[str, str]:
    url = (os.environ.get("LEANTIME_URL") or DEFAULT_URL).rstrip("/")
    token = os.environ.get("LEANTIME_ACCESS_TOKEN") or os.environ.get("LEANTIME_API_KEY")
    if not token:
        raise RuntimeError("LEANTIME_ACCESS_TOKEN (or LEANTIME_API_KEY) is required")
    auth_mode = "bearer" if os.environ.get("LEANTIME_ACCESS_TOKEN") else "api_key"
    return {
        "LEANTIME_URL": url,
        "_LEANTIME_TOKEN": token,
        "_AUTH_MODE": auth_mode,
    }


def auth_headers(env: dict[str, str]) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if env["_AUTH_MODE"] == "bearer":
        headers["Authorization"] = "Bearer " + env["_LEANTIME_TOKEN"]
    else:
        headers["X-API-KEY"] = env["_LEANTIME_TOKEN"]
    return headers


def rpc_call(env: dict[str, str], method: str, params: dict[str, Any] | None = None) -> Any:
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": 1,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        env["LEANTIME_URL"] + "/api/jsonrpc",
        data=payload,
        headers=auth_headers(env),
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        err = data["error"]
        raise RuntimeError(f"{method}: {err.get('message')} ({err.get('code')})")
    return data.get("result")


def find_project_id_by_name(projects: list[Any], name: str) -> int:
    want = name.strip().lower()
    for row in projects or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("name") or "").strip().lower() == want:
            return int(row["id"])
    raise LookupError(f"Leantime project not found by name: {name!r}")


def find_user_id_by_agent_name(users: list[Any], agent_name: str) -> int:
    """Match agent name to Leantime user firstname (case-insensitive) or username local-part."""
    want = agent_name.strip().lower()
    for row in users or []:
        if not isinstance(row, dict):
            continue
        first = str(row.get("firstname") or "").strip().lower()
        if first == want:
            return int(row["id"])
        user = str(row.get("username") or "").strip().lower()
        local = user.split("@", 1)[0]
        if local == want:
            return int(row["id"])
    raise LookupError(f"Leantime user not found for agent name: {agent_name!r}")


def _parse_agents_yaml_bindings(text: str) -> tuple[dict[str, int], dict[str, int]]:
    """Minimal YAML scrape: clients[].id→project_id, agents[].name→leantime_user_id."""
    projects: dict[str, int] = {}
    users: dict[str, int] = {}
    section = ""
    cur_client: str | None = None
    cur_agent: str | None = None
    for raw in text.splitlines():
        line = raw.rstrip()
        if re.match(r"^clients:\s*$", line):
            section = "clients"
            cur_client = cur_agent = None
            continue
        if re.match(r"^agents:\s*$", line):
            section = "agents"
            cur_client = cur_agent = None
            continue
        if re.match(r"^[a-zA-Z_][\w-]*:\s*", line) and not line.startswith(" "):
            section = ""
            cur_client = cur_agent = None
            continue
        if section == "clients":
            m = re.match(r"^-\s*id:\s*(\S+)\s*$", line.strip()) or re.match(
                r"^id:\s*(\S+)\s*$", line.strip()
            )
            if m and (line.strip().startswith("-") or cur_client is None or "id:" in line):
                if line.lstrip().startswith("-") or re.match(r"^-\s*id:", line.strip()):
                    cur_client = m.group(1).strip().strip("\"'")
                elif cur_client is None:
                    cur_client = m.group(1).strip().strip("\"'")
            m = re.match(r"^-?\s*id:\s*(\S+)\s*$", line.strip())
            if m and line.lstrip().startswith("-"):
                cur_client = m.group(1).strip().strip("\"'")
            m = re.match(r"^project_id:\s*(\d+)\s*$", line.strip())
            if m and cur_client:
                projects[cur_client] = int(m.group(1))
        if section == "agents":
            m = re.match(r"^-?\s*name:\s*(\S+)\s*$", line.strip())
            if m and line.lstrip().startswith("-"):
                cur_agent = m.group(1).strip().strip("\"'")
            m = re.match(r"^leantime_user_id:\s*(\d+)\s*$", line.strip())
            if m and cur_agent:
                users[cur_agent] = int(m.group(1))
    return projects, users


def resolve_targets_from_agents_yaml(
    path: Path | str,
    *,
    project_name: str,
    author_agent: str,
    assignee_agent: str,
) -> dict[str, int]:
    text = Path(path).read_text(encoding="utf-8")
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(text) or {}
        projects = {
            str(c.get("id")): int(c["project_id"])
            for c in (data.get("clients") or [])
            if c.get("id") is not None and c.get("project_id") is not None
        }
        users = {
            str(a.get("name")): int(a["leantime_user_id"])
            for a in (data.get("agents") or [])
            if a.get("name") is not None and a.get("leantime_user_id") is not None
        }
    except Exception:
        projects, users = _parse_agents_yaml_bindings(text)
    if project_name not in projects:
        raise LookupError(f"clients[].id={project_name!r} missing project_id in {path}")
    if author_agent not in users:
        raise LookupError(f"agents[].name={author_agent!r} missing leantime_user_id in {path}")
    if assignee_agent not in users:
        raise LookupError(
            f"agents[].name={assignee_agent!r} missing leantime_user_id in {path}"
        )
    return {
        "project_id": projects[project_name],
        "user_id": users[author_agent],
        "assigned_to": users[assignee_agent],
    }


def resolve_ticket_targets(env: dict[str, str]) -> dict[str, int]:
    project_name = (
        os.environ.get("LEANTIME_PROJECT_NAME") or DEFAULT_PROJECT_NAME
    ).strip()
    author_agent = (
        os.environ.get("LEANTIME_AUTHOR_AGENT") or DEFAULT_AUTHOR_AGENT
    ).strip()
    assignee_agent = (
        os.environ.get("LEANTIME_ASSIGNEE_AGENT") or DEFAULT_ASSIGNEE_AGENT
    ).strip()

    agents_yaml = (os.environ.get("AGENTS_YAML") or "").strip()
    if agents_yaml:
        return resolve_targets_from_agents_yaml(
            agents_yaml,
            project_name=project_name,
            author_agent=author_agent,
            assignee_agent=assignee_agent,
        )

    projects = rpc_call(env, "leantime.rpc.Projects.getAll")
    if not isinstance(projects, list):
        projects = rpc_call(env, "leantime.rpc.Projects.Projects.getAll") or []
    users = rpc_call(env, "leantime.rpc.Users.getAll")
    if not isinstance(users, list):
        users = rpc_call(env, "leantime.rpc.Users.Users.getAll") or []
    if not isinstance(projects, list):
        raise RuntimeError("Projects.getAll did not return a list")
    if not isinstance(users, list):
        raise RuntimeError("Users.getAll did not return a list")
    return {
        "project_id": find_project_id_by_name(projects, project_name),
        "user_id": find_user_id_by_agent_name(users, author_agent),
        "assigned_to": find_user_id_by_agent_name(users, assignee_agent),
    }


def create_ticket(
    env: dict[str, str],
    *,
    headline: str,
    description: str,
    project_id: int,
    user_id: int,
    assigned_to: int,
) -> Any:
    payload = json.dumps(
        {
            "jsonrpc": "2.0",
            "method": "leantime.rpc.Tickets.Tickets.addTicket",
            "params": {
                "values": {
                    "headline": headline,
                    "description": html_description(description),
                    "projectId": project_id,
                    "userId": user_id,
                    "editorId": user_id,
                    "status": 3,  # New
                    "priority": 2,
                    "tags": "cron,spend-alert,factory",
                    "date": "",
                    "assignedTo": assigned_to,
                }
            },
            "id": 1,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        env["LEANTIME_URL"] + "/api/jsonrpc",
        data=payload,
        headers=auth_headers(env),
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if "error" in data:
        err = data["error"]
        raise RuntimeError(f"addTicket: {err.get('message')} ({err.get('code')})")
    return data.get("result")


def _count_clients_scrape(text: str) -> int:
    """Count clients[] list items without PyYAML."""
    section = ""
    count = 0
    for raw in text.splitlines():
        line = raw.rstrip()
        if re.match(r"^clients:\s*$", line):
            section = "clients"
            continue
        if re.match(r"^[a-zA-Z_][\w-]*:\s*", line) and not line.startswith(" "):
            section = ""
            continue
        if section != "clients":
            continue
        if re.match(r"^-\s+", line.lstrip()) and (
            line.startswith(" ") or line.startswith("-")
        ):
            # top-level list entry under clients (indent 0 "- " or "  - ")
            stripped = line.lstrip()
            indent = len(line) - len(stripped)
            if indent <= 2 and stripped.startswith("-"):
                count += 1
    return count


def count_clients_from_agents_yaml(path: Path | str) -> int:
    text = Path(path).read_text(encoding="utf-8")
    try:
        import yaml  # type: ignore

        data = yaml.safe_load(text) or {}
        return len(data.get("clients") or [])
    except Exception:
        return _count_clients_scrape(text)


def count_clients_via_leantime(env: dict[str, str]) -> int:
    """Count Leantime clients (factory N ≡ registered clients)."""
    clients = rpc_call(env, "leantime.rpc.Clients.getAll")
    if not isinstance(clients, list):
        clients = rpc_call(env, "leantime.rpc.Clients.Clients.getAll") or []
    if not isinstance(clients, list):
        raise RuntimeError("Clients.getAll did not return a list")
    return len(clients)


def tokens_per_client_from_env() -> int:
    return max(
        1,
        int(os.environ.get("SPEND_TOKENS_PER_CLIENT", str(DEFAULT_TOKENS_PER_CLIENT))),
    )


def threshold_from_client_count(
    client_count: int, *, tokens_per_client: int | None = None
) -> int:
    per = DEFAULT_TOKENS_PER_CLIENT if tokens_per_client is None else tokens_per_client
    n = max(1, int(client_count))
    return max(1, n * max(1, int(per)))


def threshold_from_env() -> int:
    """Legacy: fixed SPEND_TOKEN_THRESHOLD if set; else 1× tokens_per_client."""
    raw = os.environ.get("SPEND_TOKEN_THRESHOLD")
    if raw is not None and str(raw).strip() != "":
        return max(1, int(raw))
    return threshold_from_client_count(1, tokens_per_client=tokens_per_client_from_env())


def resolve_threshold(*, explicit: int | None = None) -> tuple[int, int | None, int]:
    """Return (threshold, client_count|None, tokens_per_client).

    Precedence: explicit CLI → SPEND_TOKEN_THRESHOLD →
    len(clients)×SPEND_TOKENS_PER_CLIENT (AGENTS_YAML or Leantime Clients API).
    """
    per = tokens_per_client_from_env()
    if explicit is not None:
        return max(1, int(explicit)), None, per
    raw = os.environ.get("SPEND_TOKEN_THRESHOLD")
    if raw is not None and str(raw).strip() != "":
        return max(1, int(raw)), None, per

    agents_yaml = (os.environ.get("AGENTS_YAML") or "").strip()
    if agents_yaml:
        n = count_clients_from_agents_yaml(agents_yaml)
        return threshold_from_client_count(n, tokens_per_client=per), n, per

    env = load_leantime_env()
    n = count_clients_via_leantime(env)
    return threshold_from_client_count(n, tokens_per_client=per), n, per


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--logs-file", help="path to kubectl logs dump (default: stdin)")
    ap.add_argument("--window", default="24h")
    ap.add_argument("--threshold", type=int, default=None)
    ap.add_argument(
        "--create-ticket",
        action="store_true",
        help="create Leantime ticket when over threshold",
    )
    args = ap.parse_args(argv)

    if args.logs_file:
        log_text = open(args.logs_file, encoding="utf-8", errors="replace").read()
    else:
        log_text = sys.stdin.read()

    threshold, client_count, tokens_per_client = resolve_threshold(
        explicit=args.threshold
    )
    summary = sum_run_completed_usage(log_text)
    print(
        json.dumps(
            {
                "threshold": threshold,
                "client_count": client_count,
                "tokens_per_client": tokens_per_client,
                **summary,
            },
            sort_keys=True,
        ),
        flush=True,
    )

    if not should_alert(summary["total_tokens"], threshold):
        print("ok: under threshold", flush=True)
        return 0

    print("ALERT: over threshold", flush=True)
    if not args.create_ticket:
        return 0

    env = load_leantime_env()
    targets = resolve_ticket_targets(env)
    print(json.dumps({"resolved": targets}, sort_keys=True), flush=True)
    result = create_ticket(
        env,
        headline=ticket_headline(summary, threshold),
        description=ticket_description(
            summary,
            threshold=threshold,
            window=args.window,
            client_count=client_count,
            tokens_per_client=tokens_per_client,
        ),
        project_id=targets["project_id"],
        user_id=targets["user_id"],
        assigned_to=targets["assigned_to"],
    )
    print(json.dumps({"ticket": result}, default=str), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as exc:
        print(f"leantime error: {exc}", file=sys.stderr)
        sys.exit(2)
    except Exception as exc:  # noqa: BLE001 — CronJob exit code
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)
