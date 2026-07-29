"""Apply Dual-loop To-Do status labels to a Leantime project."""

from __future__ import annotations

import json
import subprocess
from typing import Any

# Default factory board (ARCHITECTURE §2.6 / agents.yaml settings.status_board)
DEFAULT_STATUS_BOARD: dict[str, int] = {
    "New": 3,
    "Blocked": 1,
    "In Progress": 4,
    "Waiting for Approval": 2,
    "Review": 10,
    "Deploying Test": 11,
    "QA": 12,
    "Deploying Prod": 13,
    "Done": 0,
}

_STATUS_TYPE: dict[str, str] = {
    "New": "NEW",
    "Blocked": "INPROGRESS",
    "In Progress": "INPROGRESS",
    "Waiting for Approval": "INPROGRESS",
    "Review": "INPROGRESS",
    "Deploying Test": "INPROGRESS",
    "QA": "INPROGRESS",
    "Deploying Prod": "INPROGRESS",
    "Done": "DONE",
}

_CLASS: dict[str, str] = {
    "New": "label-info",
    "Blocked": "label-important",
    "In Progress": "label-warning",
    "Waiting for Approval": "label-warning",
    "Review": "label-warning",
    "Deploying Test": "label-info",
    "QA": "label-info",
    "Deploying Prod": "label-info",
    "Done": "label-success",
}


def ticketlabels_settings_key(project_id: int) -> str:
    return f"projectsettings.{int(project_id)}.ticketlabels"


def dual_loop_status_labels(
    board: dict[str, int] | None = None,
) -> dict[int, dict[str, Any]]:
    return labels_from_status_board(board or DEFAULT_STATUS_BOARD)


def labels_from_status_board(board: dict[str, int]) -> dict[int, dict[str, Any]]:
    """Build Leantime ticketlabels map (int status id → attrs). Includes Archive (-1)."""
    # sort by flow order in DEFAULT when possible
    order = list(DEFAULT_STATUS_BOARD.keys())
    labels: dict[int, dict[str, Any]] = {}
    sort = 1
    for name in order:
        if name not in board:
            continue
        sid = int(board[name])
        labels[sid] = {
            "name": name,
            "class": _CLASS.get(name, "label-default"),
            "statusType": _STATUS_TYPE.get(name, "INPROGRESS"),
            "kanbanCol": True,
            "sortKey": sort,
        }
        sort += 1
    for name, sid in board.items():
        if name in order:
            continue
        labels[int(sid)] = {
            "name": name,
            "class": "label-default",
            "statusType": "INPROGRESS",
            "kanbanCol": True,
            "sortKey": sort,
        }
        sort += 1
    labels[-1] = {
        "name": "Archived",
        "class": "label-default",
        "statusType": "DONE",
        "kanbanCol": False,
        "sortKey": sort,
    }
    return labels


def php_serialize_labels(ns: str, labels: dict[int, dict[str, Any]]) -> str:
    """Serialize labels via PHP in the Leantime pod (native serialize)."""
    # JSON → PHP array for serialize
    payload = {str(k): v for k, v in labels.items()}
    php = (
        "$j=json_decode(file_get_contents('php://stdin'), true);"
        "$out=[];"
        "foreach($j as $k=>$v){$out[(int)$k]=["
        "'name'=>$v['name'],"
        "'class'=>$v['class'],"
        "'statusType'=>$v['statusType'],"
        "'kanbanCol'=>(bool)$v['kanbanCol'],"
        "'sortKey'=>(int)$v['sortKey'],"
        "];}"
        "echo serialize($out);"
    )
    pod = (
        subprocess.check_output(
            [
                "kubectl",
                "-n",
                ns,
                "get",
                "pod",
                "-l",
                "app.kubernetes.io/name=leantime",
                "-o",
                "jsonpath={.items[0].metadata.name}",
            ],
            text=True,
        ).strip()
    )
    proc = subprocess.run(
        [
            "kubectl",
            "-n",
            ns,
            "exec",
            "-i",
            pod,
            "-c",
            "leantime",
            "--",
            "php",
            "-r",
            php,
        ],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return proc.stdout.strip()


def apply_status_board_to_project(
    ns: str,
    project_id: int,
    board: dict[str, int] | None = None,
    *,
    mysql_exec,
) -> str:
    """Write projectsettings.{id}.ticketlabels. Returns settings key."""
    labels = dual_loop_status_labels(board)
    serialized = php_serialize_labels(ns, labels)
    key = ticketlabels_settings_key(project_id)
    # Escape for SQL
    ser_esc = serialized.replace("\\", "\\\\").replace("'", "''")
    key_esc = key.replace("'", "''")
    mysql_exec(
        ns,
        f"INSERT INTO zp_settings (`key`, value) VALUES ('{key_esc}', '{ser_esc}') "
        f"ON DUPLICATE KEY UPDATE value='{ser_esc}';",
    )
    # Drop Laravel cache so UI/API see new labels immediately
    try:
        subprocess.run(
            [
                "kubectl",
                "-n",
                ns,
                "exec",
                "deploy/leantime",
                "-c",
                "leantime",
                "--",
                "php",
                "bin/leantime",
                "cache:clear",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError:
        pass
    return key


def main(argv: list[str] | None = None) -> int:
    import argparse
    import os
    import sys
    from pathlib import Path

    import yaml

    p = argparse.ArgumentParser(description="Apply Dual-loop To-Do status board to a Leantime project")
    p.add_argument("--project-id", type=int, action="append", dest="project_ids")
    p.add_argument("--all-clients", action="store_true", help="Apply to every clients[].project_id in agents.yaml")
    p.add_argument("--ns", default=os.environ.get("CURSORBRIDGE_NS", "sw-factory"))
    args = p.parse_args(argv)

    root = Path(__file__).resolve().parents[3]
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import seed_factory_users as seed  # noqa: WPS433

    data = yaml.safe_load((root / "deploy/k8s/agents.yaml").read_text()) or {}
    board = (data.get("settings") or {}).get("status_board")
    if not isinstance(board, dict):
        board = None

    pids: list[int] = list(args.project_ids or [])
    if args.all_clients:
        for c in data.get("clients") or []:
            pids.append(int(c["project_id"]))
    if not pids:
        p.error("pass --project-id N and/or --all-clients")

    for pid in sorted(set(pids)):
        key = apply_status_board_to_project(
            args.ns, pid, board, mysql_exec=seed.mysql_exec
        )
        print(f"ok project_id={pid} {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
