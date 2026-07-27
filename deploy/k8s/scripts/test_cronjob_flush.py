"""Validate CursorBridge flush CronJob manifest."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CRONJOB = ROOT / "base" / "cronjob-flush-retries.yaml"


def test_flush_retries_cronjob_schedule_and_rbac():
    docs = list(yaml.safe_load_all(CRONJOB.read_text()))
    by_kind = {doc["kind"]: doc for doc in docs}

    cron = by_kind["CronJob"]
    assert cron["metadata"]["name"] == "cursorbridge-flush-retries"
    assert cron["spec"]["schedule"] == "*/5 * * * *"
    assert cron["spec"]["concurrencyPolicy"] == "Forbid"

    sa = by_kind["ServiceAccount"]["metadata"]["name"]
    role = by_kind["Role"]
    assert "pods/exec" in [r["resources"][0] for r in role["rules"] if "pods/exec" in r.get("resources", [])]
    binding = by_kind["RoleBinding"]
    assert binding["subjects"][0]["name"] == sa

    container = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    assert container["name"] == "flush"
    assert "flush-retries.php" in container["command"][-1]
    assert container["image"] == "ghcr.io/yoosungung/cursor-agent-runner:latest"
