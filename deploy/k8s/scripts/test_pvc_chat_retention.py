"""TDD: PVC chat retention helpers + CronJob manifest."""

from __future__ import annotations

import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "base" / "ops-scripts"))
import pvc_chat_retention as retention  # noqa: E402

CRONJOB = ROOT / "base" / "cronjob-pvc-retention.yaml"
KUSTOMIZATION = ROOT / "base" / "kustomization.yaml"


def test_find_stale_command_uses_chats_path_and_mtime():
    cmd = retention.find_stale_command(retention_days=14)
    assert cmd[0] == "find"
    assert "/cursor-home/.cursor/chats" in cmd
    assert "-mtime" in cmd
    assert "+14" in cmd
    assert "-delete" in cmd


def test_retention_days_from_env_defaults_to_14(monkeypatch):
    monkeypatch.delenv("CHAT_RETENTION_DAYS", raising=False)
    assert retention.retention_days_from_env() == 14
    monkeypatch.setenv("CHAT_RETENTION_DAYS", "30")
    assert retention.retention_days_from_env() == 30


def test_pvc_retention_cronjob_manifest():
    docs = list(yaml.safe_load_all(CRONJOB.read_text()))
    cron = next(d for d in docs if d["kind"] == "CronJob")
    assert cron["metadata"]["name"] == "cursorbridge-pvc-retention"
    assert cron["spec"]["schedule"] == "15 3 * * *"
    assert cron["spec"]["concurrencyPolicy"] == "Forbid"
    spec = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]
    assert spec["serviceAccountName"] == "cursorbridge-flush"
    container = spec["containers"][0]
    assert container["image"] == "ghcr.io/yoosungung/cursor-agent-runner:latest"
    cmd = "\n".join(container["command"])
    assert "pvc_chat_retention.py" in cmd
    env = {e["name"]: e.get("value") for e in container.get("env", [])}
    assert env.get("POD_LABEL") == "app=cursor-agent"
    assert env.get("CHAT_RETENTION_DAYS") == "14"


def test_kustomization_lists_pvc_retention_cronjob():
    kust = yaml.safe_load(KUSTOMIZATION.read_text())
    assert "cronjob-pvc-retention.yaml" in kust["resources"]
