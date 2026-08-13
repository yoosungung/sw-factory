#!/usr/bin/env python3
"""Dump agent MEMORY.md + mcp.json into backup PVC, then prune old days.

CronJob cursorbridge-agent-restart mounts PVC at BACKUP_ROOT and runs this
before `kubectl rollout restart`. Does not restart pods itself.
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

NAMESPACE = os.environ.get("NAMESPACE", "sw-factory")
POD_LABEL = os.environ.get("POD_LABEL", "app=cursor-agent")
CONTAINER = os.environ.get("AGENT_CONTAINER", "agent-runner")
BACKUP_ROOT = Path(os.environ.get("BACKUP_ROOT", "/backup"))
DEFAULT_RETENTION_DAYS = 7
CURSOR_HOME = os.environ.get("CURSOR_HOME", "/cursor-home")
MEMORY_REL = ".cursor/MEMORY.md"
MCP_REL = ".cursor/mcp.json"

_POD_NAME_RE = re.compile(r"^cursor-agent-(.+)-\d+$")


def retention_days_from_env() -> int:
    raw = os.environ.get("BACKUP_RETENTION_DAYS", str(DEFAULT_RETENTION_DAYS))
    return max(1, int(raw))


def agent_name_from_pod(pod_name: str) -> str | None:
    m = _POD_NAME_RE.match(pod_name)
    return m.group(1) if m else None


def list_agent_pods(namespace: str = NAMESPACE, label: str = POD_LABEL) -> list[str]:
    out = subprocess.check_output(
        [
            "kubectl",
            "-n",
            namespace,
            "get",
            "pods",
            "-l",
            label,
            "-o",
            "jsonpath={.items[*].metadata.name}",
        ],
        text=True,
    )
    return [p for p in out.split() if p]


def kubectl_exec_cat(
    pod: str, rel_path: str, *, namespace: str = NAMESPACE, container: str = CONTAINER
) -> bytes | None:
    abs_path = f"{CURSOR_HOME.rstrip('/')}/{rel_path.lstrip('/')}"
    try:
        return subprocess.check_output(
            [
                "kubectl",
                "-n",
                namespace,
                "exec",
                pod,
                "-c",
                container,
                "--",
                "cat",
                abs_path,
            ]
        )
    except subprocess.CalledProcessError:
        return None


def dump_day(
    day: str,
    pods: list[str],
    *,
    backup_root: Path = BACKUP_ROOT,
    namespace: str = NAMESPACE,
) -> list[str]:
    """Write MEMORY.md / mcp.json per agent. Returns list of agent names dumped."""
    dumped: list[str] = []
    for pod in pods:
        agent = agent_name_from_pod(pod)
        if not agent:
            print(f"skip unknown pod name: {pod}", file=sys.stderr)
            continue
        dest_dir = backup_root / day / agent
        dest_dir.mkdir(parents=True, exist_ok=True)
        wrote = False
        for rel, fname in ((MEMORY_REL, "MEMORY.md"), (MCP_REL, "mcp.json")):
            data = kubectl_exec_cat(pod, rel, namespace=namespace)
            if data is None:
                print(f"missing {rel} on {pod}", file=sys.stderr)
                continue
            (dest_dir / fname).write_bytes(data)
            wrote = True
        if wrote:
            dumped.append(agent)
    return dumped


def prune_old_days(backup_root: Path, retention_days: int, *, today: date | None = None) -> list[str]:
    """Delete YYYY-MM-DD dirs older than retention_days. Returns removed names."""
    today = today or datetime.now(timezone.utc).date()
    cutoff = today - timedelta(days=retention_days)
    removed: list[str] = []
    if not backup_root.is_dir():
        return removed
    for child in sorted(backup_root.iterdir()):
        if not child.is_dir():
            continue
        try:
            d = date.fromisoformat(child.name)
        except ValueError:
            continue
        if d < cutoff:
            shutil.rmtree(child)
            removed.append(child.name)
    return removed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--day",
        default=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        help="Backup day directory (UTC YYYY-MM-DD)",
    )
    parser.add_argument(
        "--retention-days",
        type=int,
        default=None,
        help="Override BACKUP_RETENTION_DAYS",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List pods / prune candidates only",
    )
    args = parser.parse_args(argv)
    retention = args.retention_days if args.retention_days is not None else retention_days_from_env()
    pods = list_agent_pods()
    print(f"pods={len(pods)} day={args.day} retention_days={retention}")
    if args.dry_run:
        for p in pods:
            print(f"would dump {p} -> {agent_name_from_pod(p)}")
        return 0
    dumped = dump_day(args.day, pods)
    print(f"dumped_agents={','.join(dumped) if dumped else '(none)'}")
    removed = prune_old_days(BACKUP_ROOT, retention)
    print(f"pruned={','.join(removed) if removed else '(none)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
