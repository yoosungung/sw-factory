"""Tests for bridge.json prompt sync from agents.yaml."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sync_bridge_json", SCRIPTS / "sync-bridge-json.py")
assert spec and spec.loader
mod = importlib.util.module_from_spec(spec)
sys.modules["sync_bridge_json"] = mod
spec.loader.exec_module(mod)

ROOT = SCRIPTS.parents[2]
BRIDGE_JSON = ROOT / "leantime-plugin" / "bridge.json"


def test_handoff_prompt_requires_git_ship():
    assert "git-ship" in mod.PROMPTS["handoff"]
    assert "push" in mod.PROMPTS["handoff"].lower()


def test_review_status_prompt_requires_push():
    assert "git-ship" in mod.STATUS_PROMPTS["4"]
    assert "push" in mod.STATUS_PROMPTS["4"].lower()


def test_bridge_json_matches_sync_prompts():
    bridge = json.loads(BRIDGE_JSON.read_text())
    assert bridge["prompts"]["handoff"] == mod.PROMPTS["handoff"]
    assert bridge["status_prompts"]["4"] == mod.STATUS_PROMPTS["4"]


def test_normalize_schedules_common_and_per_agent():
    assert mod.normalize_schedules(None) == []
    assert mod.normalize_schedules([]) == []
    out = mod.normalize_schedules(
        [
            {
                "id": "weekday-check",
                "cron": "0 9 * * 1-5",
                "prompt": "check open tickets",
                "success_checks": ["leave comment"],
            },
            {
                "id": "finder-wiki",
                "cron": "0 10 * * 1",
                "agents": ["finder"],
                "prompt": "wiki check",
            },
            {
                "id": "candy-pm-checkpoint",
                "cron": "5,20,35,50 * * * *",
                "agents": ["candy"],
                "gates": ["in_progress"],
                "prompt": "checkpoint",
            },
            {
                "id": "no-gates",
                "cron": "0 11 * * *",
                "prompt": "always",
                "gates": [],
            },
        ]
    )
    assert out[0] == {
        "id": "weekday-check",
        "cron": "0 9 * * 1-5",
        "prompt": "check open tickets",
        "success_checks": ["leave comment"],
    }
    assert out[1]["agents"] == ["finder"]
    assert "gates" not in out[1]
    assert out[2]["gates"] == ["in_progress"]
    assert "gates" not in out[3]


def test_normalize_schedule_gates_rejects_unknown():
    try:
        mod.normalize_schedule_gates(["in_progress", "nope"], "x")
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "nope" in str(exc)


def test_normalize_budget():
    assert mod.normalize_budget(None) is None
    assert mod.normalize_budget({"timeout_ms": 600000}) == {"timeout_ms": 600000}
    assert mod.normalize_budget({"timeout_ms": 600000.0}) == {"timeout_ms": 600000}
    try:
        mod.normalize_budget({"timeout_ms": "x"})
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "timeout_ms" in str(exc)


def test_bridge_json_budget_timeout_is_ten_minutes():
    bridge = json.loads(BRIDGE_JSON.read_text())
    assert bridge["budget"]["timeout_ms"] == 600000


def test_normalize_success_retry():
    assert mod.normalize_success_retry(None) is None
    assert mod.normalize_success_retry({"max_attempts": 2}) == {"max_attempts": 2}
    try:
        mod.normalize_success_retry({"max_attempts": -1})
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "max_attempts" in str(exc)


def test_bridge_json_success_retry_default():
    bridge = json.loads(BRIDGE_JSON.read_text())
    assert bridge["success_retry"]["max_attempts"] == 3


def test_normalize_success_checks():
    assert mod.normalize_success_checks([" a ", "b"], "x") == ["a", "b"]
    try:
        mod.normalize_success_checks([""], "x")
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "x" in str(exc)


def test_normalize_schedules_rejects_incomplete():
    try:
        mod.normalize_schedules([{"id": "x", "cron": "0 9 * * *"}])
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "prompt" in str(exc)
