"""TDD: CURSOR_API_KEY spend alert helpers + CronJob manifest."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "base" / "ops-scripts"))
import spend_alert as spend  # noqa: E402

CRONJOB = ROOT / "base" / "cronjob-spend-alert.yaml"
KUSTOMIZATION = ROOT / "base" / "kustomization.yaml"
FLUSH = ROOT / "base" / "cronjob-flush-retries.yaml"


def test_extract_usage_tokens_handles_camel_and_snake():
    assert spend.extract_usage_tokens({"inputTokens": 10, "outputTokens": 5}) == (10, 5)
    assert spend.extract_usage_tokens({"input_tokens": 3, "output_tokens": 2}) == (3, 2)
    assert spend.extract_usage_tokens({}) == (0, 0)


def test_sum_run_completed_usage_from_json_logs():
    lines = [
        json.dumps(
            {
                "event": "run.completed",
                "agent_id": "candy",
                "usage": {"inputTokens": 100, "outputTokens": 40},
            }
        ),
        "not-json",
        json.dumps({"event": "run.started", "agent_id": "candy"}),
        json.dumps(
            {
                "event": "run.completed",
                "agent_id": "path",
                "usage": {"input_tokens": 50, "output_tokens": 10},
            }
        ),
    ]
    summary = spend.sum_run_completed_usage("\n".join(lines))
    assert summary["runs"] == 2
    assert summary["input_tokens"] == 150
    assert summary["output_tokens"] == 50
    assert summary["total_tokens"] == 200
    assert summary["by_agent"]["candy"] == 140
    assert summary["by_agent"]["path"] == 60


def test_should_alert_respects_threshold():
    assert spend.should_alert(100, threshold=100) is True
    assert spend.should_alert(99, threshold=100) is False


def test_ticket_headline_and_description_include_totals():
    summary = {
        "runs": 2,
        "input_tokens": 150,
        "output_tokens": 50,
        "total_tokens": 200,
        "by_agent": {"candy": 140, "path": 60},
    }
    headline = spend.ticket_headline(summary, threshold=100)
    assert "spend" in headline.lower() or "Spend" in headline
    assert "200" in headline
    body = spend.ticket_description(summary, threshold=100, window="24h")
    assert "candy" in body and "140" in body
    assert "threshold" in body.lower() or "100" in body


def test_spend_alert_cronjob_manifest():
    docs = list(yaml.safe_load_all(CRONJOB.read_text()))
    cron = next(d for d in docs if d["kind"] == "CronJob")
    assert cron["metadata"]["name"] == "cursorbridge-spend-alert"
    assert cron["spec"]["schedule"] == "0 */6 * * *"
    spec = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]
    assert spec["serviceAccountName"] == "cursorbridge-flush"
    container = spec["containers"][0]
    cmd = "\n".join(container["command"])
    assert "spend_alert.py" in cmd
    assert "kubectl" in cmd and "logs" in cmd
    env_names = {e["name"] for e in container.get("env", [])}
    assert "SPEND_TOKEN_THRESHOLD" in env_names
    assert "LEANTIME_ACCESS_TOKEN" in env_names
    assert "LEANTIME_PROJECT_ID" in env_names


def test_flush_role_allows_pods_log():
    docs = list(yaml.safe_load_all(FLUSH.read_text()))
    role = next(d for d in docs if d["kind"] == "Role")
    resources = set()
    for rule in role["rules"]:
        resources.update(rule.get("resources", []))
    assert "pods/log" in resources


def test_kustomization_lists_spend_alert_cronjob():
    kust = yaml.safe_load(KUSTOMIZATION.read_text())
    assert "cronjob-spend-alert.yaml" in kust["resources"]
