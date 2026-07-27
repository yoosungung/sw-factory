#!/usr/bin/env python3
"""Alert when shared CURSOR_API_KEY usage from agent-runner logs exceeds a threshold.

Reads kubectl log text (stdin or --logs-file), sums run.completed usage tokens,
and optionally creates a Leantime ticket in the factory project.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

DEFAULT_THRESHOLD = 2_000_000
DEFAULT_PROJECT_ID = 16  # agents-runtime
DEFAULT_URL = "http://leantime.leantime.svc"


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
    summary: dict[str, Any], *, threshold: int, window: str
) -> str:
    lines = [
        "## CURSOR_API_KEY spend alert",
        f"window: {window}",
        f"threshold_tokens: {threshold}",
        f"total_tokens: {summary['total_tokens']}",
        f"input_tokens: {summary['input_tokens']}",
        f"output_tokens: {summary['output_tokens']}",
        f"runs_with_usage: {summary['runs']}",
        "",
        "### by_agent",
    ]
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


def threshold_from_env() -> int:
    return max(1, int(os.environ.get("SPEND_TOKEN_THRESHOLD", str(DEFAULT_THRESHOLD))))


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

    threshold = args.threshold if args.threshold is not None else threshold_from_env()
    summary = sum_run_completed_usage(log_text)
    print(json.dumps({"threshold": threshold, **summary}, sort_keys=True), flush=True)

    if not should_alert(summary["total_tokens"], threshold):
        print("ok: under threshold", flush=True)
        return 0

    print("ALERT: over threshold", flush=True)
    if not args.create_ticket:
        return 0

    env = load_leantime_env()
    project_id = int(os.environ.get("LEANTIME_PROJECT_ID", str(DEFAULT_PROJECT_ID)))
    user_id = int(os.environ.get("LEANTIME_USER_ID", "13"))  # infra
    assigned_to = int(os.environ.get("LEANTIME_ASSIGNED_TO", "1"))  # eric
    result = create_ticket(
        env,
        headline=ticket_headline(summary, threshold),
        description=ticket_description(
            summary, threshold=threshold, window=args.window
        ),
        project_id=project_id,
        user_id=user_id,
        assigned_to=assigned_to,
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
