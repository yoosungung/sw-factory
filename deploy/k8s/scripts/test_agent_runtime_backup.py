"""TDD: agent runtime backup helpers + CronJob manifest."""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CRONJOB = ROOT / "base" / "cronjob-agent-restart.yaml"
OPS = ROOT / "base" / "ops-scripts" / "agent_runtime_backup.py"
KUST = ROOT / "base" / "kustomization.yaml"

sys.path.insert(0, str(ROOT / "base" / "ops-scripts"))
import agent_runtime_backup as arb  # noqa: E402


def test_agent_name_from_pod():
    assert arb.agent_name_from_pod("cursor-agent-pm-0") == "pm"
    assert arb.agent_name_from_pod("cursor-agent-sw-factory-0") == "sw-factory"
    assert arb.agent_name_from_pod("other") is None


def test_prune_old_days(tmp_path: Path):
    (tmp_path / "2026-08-01" / "pm").mkdir(parents=True)
    (tmp_path / "2026-08-01" / "pm" / "MEMORY.md").write_text("old")
    (tmp_path / "2026-08-10" / "pm").mkdir(parents=True)
    (tmp_path / "2026-08-10" / "pm" / "MEMORY.md").write_text("keep")
    removed = arb.prune_old_days(tmp_path, retention_days=7, today=date(2026, 8, 13))
    assert "2026-08-01" in removed
    assert not (tmp_path / "2026-08-01").exists()
    assert (tmp_path / "2026-08-10" / "pm" / "MEMORY.md").is_file()


def test_cronjob_agent_restart_manifest():
    docs = list(yaml.safe_load_all(CRONJOB.read_text()))
    by_kind: dict = {}
    for doc in docs:
        by_kind.setdefault(doc["kind"], []).append(doc)

    assert by_kind["ServiceAccount"][0]["metadata"]["name"] == "cursor-agent-restarter"
    role = by_kind["Role"][0]
    resources = {tuple(r.get("resources", [])) for r in role["rules"]}
    assert ("pods",) in resources or any("pods" in r.get("resources", []) for r in role["rules"])
    assert any("pods/exec" in r.get("resources", []) for r in role["rules"])
    assert any("statefulsets" in r.get("resources", []) for r in role["rules"])

    pvc = by_kind["PersistentVolumeClaim"][0]
    assert pvc["metadata"]["name"] == "agent-runtime-backup"
    assert pvc["spec"]["resources"]["requests"]["storage"] == "1Gi"

    cron = by_kind["CronJob"][0]
    assert cron["metadata"]["name"] == "cursorbridge-agent-restart"
    assert cron["spec"]["schedule"] == "0 15 * * *"
    assert cron["spec"]["concurrencyPolicy"] == "Forbid"
    container = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    assert container["image"] == "ghcr.io/yoosungung/cursor-agent-runner:latest"
    cmd = container["command"][-1]
    assert "agent_runtime_backup.py" in cmd
    assert "rollout restart statefulset -l app=cursor-agent" in cmd
    assert any(v.get("persistentVolumeClaim", {}).get("claimName") == "agent-runtime-backup"
               for v in cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["volumes"])


def test_kustomization_registers_agent_restart():
    text = KUST.read_text()
    assert "cronjob-agent-restart.yaml" in text
    assert "ops-scripts/agent_runtime_backup.py" in text
    assert "namespace: sw-factory" in text
    assert OPS.is_file()
