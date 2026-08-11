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
OVERLAY = ROOT / "overlays" / "sw-factory" / "patch-spend.yaml"
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
                "agent_id": "pm",
                "usage": {"inputTokens": 100, "outputTokens": 40},
            }
        ),
        "not-json",
        json.dumps({"event": "run.started", "agent_id": "pm"}),
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
    assert summary["by_agent"]["pm"] == 140
    assert summary["by_agent"]["path"] == 60


def test_should_alert_respects_threshold():
    assert spend.should_alert(100, threshold=100) is True
    assert spend.should_alert(99, threshold=100) is False


def test_tokens_per_client_default_is_100m():
    assert spend.DEFAULT_TOKENS_PER_CLIENT == 100_000_000


def test_count_clients_from_agents_yaml(tmp_path):
    path = tmp_path / "agents.yaml"
    path.write_text(
        "\n".join(
            [
                "clients:",
                "- id: sw-factory",
                "  leantime_client_id: 2",
                "  project_id: 5",
                "- id: nl2sql",
                "  leantime_client_id: 3",
                "  project_id: 6",
                "agents:",
                "- name: ta",
                "  leantime_user_id: 4",
            ]
        ),
        encoding="utf-8",
    )
    assert spend.count_clients_from_agents_yaml(path) == 2


def test_threshold_from_client_count():
    assert spend.threshold_from_client_count(4) == 400_000_000
    assert spend.threshold_from_client_count(0) == spend.DEFAULT_TOKENS_PER_CLIENT
    assert spend.threshold_from_client_count(2, tokens_per_client=10_000_000) == 20_000_000


def test_resolve_threshold_prefers_explicit_env(monkeypatch, tmp_path):
    path = tmp_path / "agents.yaml"
    path.write_text("clients:\n- id: a\n  project_id: 1\n", encoding="utf-8")
    monkeypatch.setenv("AGENTS_YAML", str(path))
    monkeypatch.setenv("SPEND_TOKEN_THRESHOLD", "12345")
    monkeypatch.delenv("SPEND_TOKENS_PER_CLIENT", raising=False)
    threshold, client_count, _per = spend.resolve_threshold()
    assert threshold == 12345
    assert client_count is None


def test_resolve_threshold_uses_clients_times_per_client(monkeypatch, tmp_path):
    path = tmp_path / "agents.yaml"
    path.write_text(
        "clients:\n- id: a\n  project_id: 1\n- id: b\n  project_id: 2\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AGENTS_YAML", str(path))
    monkeypatch.delenv("SPEND_TOKEN_THRESHOLD", raising=False)
    monkeypatch.setenv("SPEND_TOKENS_PER_CLIENT", "20000000")
    threshold, client_count, per = spend.resolve_threshold()
    assert threshold == 40_000_000
    assert client_count == 2
    assert per == 20_000_000


def test_ticket_headline_and_description_include_totals():
    summary = {
        "runs": 2,
        "input_tokens": 150,
        "output_tokens": 50,
        "total_tokens": 200,
        "by_agent": {"pm": 140, "path": 60},
    }
    headline = spend.ticket_headline(summary, threshold=100)
    assert "spend" in headline.lower() or "Spend" in headline
    assert "200" in headline
    body = spend.ticket_description(summary, threshold=100, window="24h")
    assert "pm" in body and "140" in body
    assert "threshold" in body.lower() or "100" in body


def test_find_project_id_by_name():
    projects = [
        {"id": 5, "name": "sw-factory"},
        {"id": 1, "name": "demo-acme"},
    ]
    assert spend.find_project_id_by_name(projects, "sw-factory") == 5
    assert spend.find_project_id_by_name(projects, "DEMO-ACME") == 1
    try:
        spend.find_project_id_by_name(projects, "missing")
        assert False, "expected LookupError"
    except LookupError as exc:
        assert "missing" in str(exc)


def test_find_user_id_by_agent_name():
    users = [
        {"id": 1, "firstname": "Eric", "username": "suyoo@didim.com"},
        {"id": 4, "firstname": "ta", "username": "ta@example.com"},
        {"id": 2, "firstname": "pm", "username": "pm@example.com"},
    ]
    assert spend.find_user_id_by_agent_name(users, "eric") == 1
    assert spend.find_user_id_by_agent_name(users, "ta") == 4
    assert spend.find_user_id_by_agent_name(users, "pm") == 2
    try:
        spend.find_user_id_by_agent_name(users, "ghost")
        assert False, "expected LookupError"
    except LookupError:
        pass


def test_resolve_targets_from_agents_yaml(tmp_path):
    path = tmp_path / "agents.yaml"
    path.write_text(
        "\n".join(
            [
                "clients:",
                "- id: demo-acme",
                "  leantime_client_id: 2",
                "  project_id: 55",
                "agents:",
                "- name: eric",
                "  leantime_user_id: 11",
                "- name: ta",
                "  leantime_user_id: 44",
            ]
        ),
        encoding="utf-8",
    )
    got = spend.resolve_targets_from_agents_yaml(
        path,
        project_name="demo-acme",
        author_agent="ta",
        assignee_agent="eric",
    )
    assert got == {"project_id": 55, "user_id": 44, "assigned_to": 11}


def test_spend_alert_defaults_are_names_not_numeric_ids():
    assert spend.DEFAULT_PROJECT_NAME == "sw-factory"
    assert spend.DEFAULT_AUTHOR_AGENT == "ta"
    assert spend.DEFAULT_ASSIGNEE_AGENT == "eric"
    assert not hasattr(spend, "DEFAULT_PROJECT_ID")
    src = (ROOT / "base" / "ops-scripts" / "spend_alert.py").read_text()
    assert "LEANTIME_PROJECT_NAME" in src
    assert "LEANTIME_AUTHOR_AGENT" in src
    assert "LEANTIME_ASSIGNEE_AGENT" in src
    # no committed numeric id defaults for ticket targets
    assert 'LEANTIME_PROJECT_ID", "' not in src
    assert 'LEANTIME_USER_ID", "' not in src


def _env_map(cron_path: Path) -> dict:
    docs = list(yaml.safe_load_all(cron_path.read_text()))
    cron = next(d for d in docs if d["kind"] == "CronJob")
    container = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    return {e["name"]: e for e in container.get("env", [])}


def test_spend_alert_cronjob_manifest_uses_names():
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
    env = _env_map(CRONJOB)
    assert "SPEND_TOKENS_PER_CLIENT" in env
    assert env["SPEND_TOKENS_PER_CLIENT"]["value"] == "100000000"
    assert "SPEND_TOKEN_THRESHOLD" not in env
    assert "LEANTIME_ACCESS_TOKEN" in env
    assert env["LEANTIME_PROJECT_NAME"]["value"] == "sw-factory"
    assert env["LEANTIME_AUTHOR_AGENT"]["value"] == "ta"
    assert env["LEANTIME_ASSIGNEE_AGENT"]["value"] == "eric"
    assert "LEANTIME_PROJECT_ID" not in env
    assert "LEANTIME_USER_ID" not in env
    assert "LEANTIME_ASSIGNED_TO" not in env
    token_env = env["LEANTIME_ACCESS_TOKEN"]
    assert token_env["valueFrom"]["secretKeyRef"]["key"] == "LEANTIME_ACCESS_TOKEN_ta"


def test_overlay_spend_patch_uses_names():
    env = _env_map(OVERLAY)
    assert env["SPEND_TOKENS_PER_CLIENT"]["value"] == "100000000"
    assert "SPEND_TOKEN_THRESHOLD" not in env
    assert env["LEANTIME_PROJECT_NAME"]["value"] == "sw-factory"
    assert env["LEANTIME_AUTHOR_AGENT"]["value"] == "ta"
    assert env["LEANTIME_ASSIGNEE_AGENT"]["value"] == "eric"
    assert "LEANTIME_PROJECT_ID" not in env


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
