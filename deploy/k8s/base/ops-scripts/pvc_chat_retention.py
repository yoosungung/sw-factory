#!/usr/bin/env python3
"""Delete stale Cursor chat trees on agent PVC mounts.

Intended for CronJob cursorbridge-pvc-retention: list pods with label
app=cursor-agent and kubectl-exec find -mtime under /cursor-home/.cursor/chats.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys

CHATS_DIR = "/cursor-home/.cursor/chats"
DEFAULT_RETENTION_DAYS = 14
NAMESPACE = os.environ.get("NAMESPACE", "leantime")
POD_LABEL = os.environ.get("POD_LABEL", "app=cursor-agent")
CONTAINER = os.environ.get("AGENT_CONTAINER", "agent-runner")


def retention_days_from_env() -> int:
    raw = os.environ.get("CHAT_RETENTION_DAYS", str(DEFAULT_RETENTION_DAYS))
    return max(1, int(raw))


def find_stale_command(*, retention_days: int, chats_dir: str = CHATS_DIR) -> list[str]:
    return [
        "find",
        chats_dir,
        "-mindepth",
        "1",
        "-mtime",
        f"+{retention_days}",
        "-print",
        "-delete",
    ]


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


def purge_pod(
    pod: str,
    *,
    retention_days: int,
    namespace: str = NAMESPACE,
    container: str = CONTAINER,
    dry_run: bool = False,
) -> None:
    cmd = find_stale_command(retention_days=retention_days)
    remote = f"mkdir -p {CHATS_DIR} && " + " ".join(
        _shell_quote(part) for part in cmd
    )
    kubectl = [
        "kubectl",
        "-n",
        namespace,
        "exec",
        pod,
        "-c",
        container,
        "--",
        "sh",
        "-c",
        remote,
    ]
    if dry_run:
        print("DRY_RUN:", " ".join(kubectl), flush=True)
        return
    subprocess.run(kubectl, check=False)


def _shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="kubectl exec find -delete")
    ap.add_argument("--dry-run", action="store_true", help="print kubectl commands only")
    ap.add_argument("--days", type=int, default=None, help="override CHAT_RETENTION_DAYS")
    args = ap.parse_args(argv)

    days = args.days if args.days is not None else retention_days_from_env()
    print(f"retention_days={days} chats_dir={CHATS_DIR}", flush=True)

    if not args.apply and not args.dry_run:
        print(" ".join(find_stale_command(retention_days=days)))
        return 0

    pods = list_agent_pods()
    if not pods:
        print("no agent pods matched", flush=True)
        return 0

    for pod in pods:
        print(f"purge pod={pod}", flush=True)
        purge_pod(pod, retention_days=days, dry_run=args.dry_run or not args.apply)
    return 0


if __name__ == "__main__":
    sys.exit(main())
