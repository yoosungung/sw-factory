"""Tests for agents.yaml → bridge.json / deploy helpers."""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parent


def _load_sync_module():
    path = SCRIPTS / "sync-bridge-json.py"
    spec = importlib.util.spec_from_file_location("sync_bridge_json", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules["sync_bridge_json"] = module
    spec.loader.exec_module(module)
    return module


def test_agent_model_uses_agent_override():
    mod = _load_sync_module()
    settings = {"model": "composer-2.5"}
    agent = {"name": "path", "type": "sessions", "model": "gpt-5.3-codex"}
    assert mod.agent_model(agent, settings) == "gpt-5.3-codex"


def test_agent_model_falls_back_to_settings_default():
    mod = _load_sync_module()
    settings = {"model": "composer-2.5"}
    agent = {"name": "asky", "type": "sessions"}
    assert mod.agent_model(agent, settings) == "composer-2.5"


def test_agent_model_hard_default_when_unset():
    mod = _load_sync_module()
    agent = {"name": "runtime", "type": "sessions"}
    assert mod.agent_model(agent, {}) == "composer-2.5"


def test_runner_url_human_empty():
    mod = _load_sync_module()
    assert mod.runner_url_for({"name": "eric", "type": "human"}) == ""


def test_runner_url_sessions_dns():
    mod = _load_sync_module()
    assert (
        mod.runner_url_for({"name": "path", "type": "sessions"})
        == "http://cursor-agent-path.leantime.svc:8080"
    )


def test_runner_url_openai_requires_override():
    mod = _load_sync_module()
    with pytest.raises(ValueError, match="runner_url"):
        mod.runner_url_for({"name": "candy", "type": "openai"})


def test_runner_url_openai_uses_override():
    mod = _load_sync_module()
    url = mod.runner_url_for(
        {
            "name": "candy",
            "type": "openai",
            "runner_url": "http://hermes-master.ai-agents.svc:8642/",
        }
    )
    assert url == "http://hermes-master.ai-agents.svc:8642"


def test_bridge_persona_defaults_to_agent_name(tmp_path, monkeypatch):
    mod = _load_sync_module()
    agents_yaml = tmp_path / "agents.yaml"
    bridge_json = tmp_path / "bridge.json"
    agents_yaml.write_text(
        """
agents:
  - name: path
    leantime_user_id: 6
    email: path@example.com
    type: sessions
settings: {}
""".strip()
    )
    monkeypatch.setattr(mod, "AGENTS_YAML", agents_yaml)
    monkeypatch.setattr(mod, "BRIDGE_JSON", bridge_json)
    mod.main()
    bridge = json.loads(bridge_json.read_text())
    assert bridge["agents"][0]["persona"] == "path"
    assert bridge["agents"][0]["name"] == "path"
    assert bridge["agents"][0]["type"] == "sessions"
    assert "is_bot" not in bridge["agents"][0]
    assert bridge["schedules"] == []


def test_bridge_sync_openai_agent(tmp_path, monkeypatch):
    mod = _load_sync_module()
    agents_yaml = tmp_path / "agents.yaml"
    bridge_json = tmp_path / "bridge.json"
    agents_yaml.write_text(
        """
agents:
  - name: candy
    leantime_user_id: 4
    email: candy@example.com
    type: openai
    runner_url: http://hermes-master.ai-agents.svc:8642
settings: {}
""".strip()
    )
    monkeypatch.setattr(mod, "AGENTS_YAML", agents_yaml)
    monkeypatch.setattr(mod, "BRIDGE_JSON", bridge_json)
    mod.main()
    bridge = json.loads(bridge_json.read_text())
    agent = bridge["agents"][0]
    assert agent["type"] == "openai"
    assert agent["runner_url"] == "http://hermes-master.ai-agents.svc:8642"
    assert "model" not in agent


def test_statefulset_template_honors_gh_token_secret_key():
    """agents[].gh_token_secret_key → Secret key for env GH_TOKEN (candy override)."""
    root = SCRIPTS.parents[2]
    ss_tpl = (root / "deploy/k8s/templates/statefulset.yaml.tpl").read_text()
    assert "{{GH_TOKEN_SECRET_KEY}}" in ss_tpl

    def render(name: str, gh_key: str) -> str:
        return (
            ss_tpl.replace("{{NAME}}", name)
            .replace("{{PERSONA}}", name)
            .replace("{{EMAIL}}", f"{name}@example.com")
            .replace("{{GIT_REPO}}", "")
            .replace("{{RUNNER_IMAGE}}", "example/runner:test")
            .replace("{{MODEL}}", "auto")
            .replace("{{GH_TOKEN_SECRET_KEY}}", gh_key)
        )

    candy = render("candy", "GH_TOKEN_candy")
    path = render("path", "GH_TOKEN")
    assert "key: GH_TOKEN_candy" in candy
    assert "key: GH_TOKEN_path" in path  # optional override slot
    assert "                  key: GH_TOKEN\n" in path or "                  key: GH_TOKEN\r\n" in path
    assert "GH_TOKEN_candy" not in path


def test_bridge_sync_includes_schedules(tmp_path, monkeypatch):
    mod = _load_sync_module()
    agents_yaml = tmp_path / "agents.yaml"
    bridge_json = tmp_path / "bridge.json"
    agents_yaml.write_text(
        """
agents:
  - name: finder
    leantime_user_id: 9
    email: finder@example.com
    type: sessions
settings:
  schedules:
    - id: weekday-check
      cron: "0 9 * * 1-5"
      prompt: check all
    - id: finder-only
      cron: "0 10 * * 1"
      agents: [finder]
      prompt: wiki
""".strip()
    )
    monkeypatch.setattr(mod, "AGENTS_YAML", agents_yaml)
    monkeypatch.setattr(mod, "BRIDGE_JSON", bridge_json)
    mod.main()
    bridge = json.loads(bridge_json.read_text())
    assert bridge["schedules"][0]["id"] == "weekday-check"
    assert "agents" not in bridge["schedules"][0]
    assert bridge["schedules"][1]["agents"] == ["finder"]
