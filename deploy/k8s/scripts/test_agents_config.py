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
        == "http://cursor-agent-path.sw-factory.svc:8080"
    )


def test_runner_url_openai_requires_override():
    mod = _load_sync_module()
    with pytest.raises(ValueError, match="runner_url"):
        mod.runner_url_for({"name": "pm", "type": "openai"})


def test_runner_url_openai_uses_override():
    mod = _load_sync_module()
    url = mod.runner_url_for(
        {
            "name": "pm",
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
  - name: pm
    leantime_user_id: 4
    email: pm@example.com
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
    """agents[].gh_token_secret_key → Secret key for env GH_TOKEN (pm override)."""
    root = SCRIPTS.parents[2]
    ss_tpl = (root / "deploy/k8s/templates/statefulset.yaml.tpl").read_text()
    assert "{{GH_TOKEN_SECRET_KEY}}" in ss_tpl
    assert "{{SERVICE_ACCOUNT}}" in ss_tpl
    assert "{{ORG_WIKI_URL}}" in ss_tpl

    def render(name: str, gh_key: str, sa: str = "cursor-agent", org_wiki: str = "") -> str:
        return (
            ss_tpl.replace("{{NAME}}", name)
            .replace("{{PERSONA}}", name)
            .replace("{{EMAIL}}", f"{name}@example.com")
            .replace("{{GIT_REPO}}", "")
            .replace("{{RUNNER_IMAGE}}", "example/runner:test")
            .replace("{{MODEL}}", "auto")
            .replace("{{GH_TOKEN_SECRET_KEY}}", gh_key)
            .replace("{{SERVICE_ACCOUNT}}", sa)
            .replace("{{ORG_WIKI_URL}}", org_wiki)
            .replace("{{NAMESPACE}}", "sw-factory")
            .replace("{{LEANTIME_URL}}", "http://leantime.sw-factory.svc")
            .replace("{{SEED_PERSONA_SCRIPT}}", "              echo seed")
        )

    pm = render("pm", "GH_TOKEN_pm", "cursor-agent", "https://github.com/demo-org/org-wiki.git")
    path = render("path", "GH_TOKEN")
    ta = render("ta", "GH_TOKEN_ta", "cursor-agent-ta")
    assert "key: GH_TOKEN_pm" in pm
    assert "key: GH_TOKEN_path" in path  # optional override slot
    assert "                  key: GH_TOKEN\n" in path or "                  key: GH_TOKEN\r\n" in path
    assert "GH_TOKEN_pm" not in path
    assert "serviceAccountName: cursor-agent\n" in pm
    assert "serviceAccountName: cursor-agent-ta\n" in ta
    assert "ORG_WIKI_URL" in pm
    assert "https://github.com/demo-org/org-wiki.git" in pm


def test_agents_yaml_sample_has_org_wiki_and_km():
    root = SCRIPTS.parents[2]
    import yaml

    data = yaml.safe_load((root / "deploy/k8s/agents.yaml.sample").read_text())
    repo_ids = {r["id"] for r in data.get("repos", [])}
    assert "org-wiki" in repo_ids
    km = next(a for a in data["agents"] if a["name"] == "km")
    assert km["primary_repo"] == "org-wiki"
    assert km["type"] == "sessions"
    ta = next(a for a in data["agents"] if a["name"] == "ta")
    assert ta.get("gh_token_secret_key") == "GH_TOKEN_ta"
    schedules = {s["id"]: s for s in data["settings"]["schedules"]}
    assert "km-wiki" in schedules
    assert "Inbox drain" in schedules["km-wiki"]["prompt"] or "inbox" in schedules["km-wiki"]["prompt"].lower()
    prompt = schedules["pm-checkpoint"]["prompt"]
    assert "bridge.json" in prompt and "leantime_user_id" in prompt
    assert "never hardcode" in prompt.lower() or "Mentions: resolve" in prompt
    assert "pm=2" not in prompt and "km=3" not in prompt
    assert "sw-factory=" not in prompt
    assert "nl2sql=" not in prompt
    assert "candidate=" not in prompt
    assert "ta=13" not in prompt and "qa=15" not in prompt and "aa=16" not in prompt
    assert next(a for a in data["agents"] if a["name"] == "pm")["leantime_user_id"] == 2
    assert next(a for a in data["agents"] if a["name"] == "km")["leantime_user_id"] == 3
    assert next(a for a in data["agents"] if a["name"] == "ta")["leantime_user_id"] == 4
    assert next(a for a in data["agents"] if a["name"] == "qa")["leantime_user_id"] == 5
    assert next(a for a in data["agents"] if a["name"] == "aa")["leantime_user_id"] == 6
    agent_names = {a["name"] for a in data["agents"]}
    assert "nl2sql" not in agent_names and "candidate" not in agent_names
    # "sw-factory" as developer agent is tenant-local; sample must not include it
    assert "sw-factory" not in agent_names
    client_ids = {c["id"] for c in data.get("clients", [])}
    assert client_ids == {"demo-acme"}
    repo_urls = " ".join(r.get("git_repo_url", "") for r in data.get("repos", []))
    assert "yoosungung" not in repo_urls and "berryking" not in repo_urls
    assert schedules["pm-checkpoint"]["gates"] == ["flow_active"]
    assert "Deploying" in schedules["pm-checkpoint"]["prompt"]
    # §2.6 #14 stall ladder: 2h → assignee health-check; +1h silence → @ta runtime check
    cp = schedules["pm-checkpoint"]["prompt"]
    assert "≥2h" in cp or ">=2h" in cp
    assert "1h" in cp
    assert "assignee-runtime-check" in cp or "@ta" in cp.lower()
    # Status-board upsert (no verify spam): marker + edit_comment
    assert "pm-checkpoint-status" in cp
    assert "edit_comment" in cp
    assert "Mention/comment storm" in cp
    assert ("≥8" in cp or ">=8" in cp) and ("≥12" in cp or ">=12" in cp)


def test_org_wiki_url_resolves_wiki_alias():
    """render-agents: org-wiki preferred; legacy id wiki also sets ORG_WIKI_URL."""
    from repos import index_repos

    repos = index_repos(
        [{"id": "wiki", "git_repo_url": "https://github.com/demo-org/wiki.git"}]
    )
    org = repos.get("org-wiki") or repos.get("wiki") or {}
    assert org["git_repo_url"] == "https://github.com/demo-org/wiki.git"


def test_bridge_sync_includes_schedules(tmp_path, monkeypatch):
    mod = _load_sync_module()
    agents_yaml = tmp_path / "agents.yaml"
    bridge_json = tmp_path / "bridge.json"
    agents_yaml.write_text(
        """
agents:
  - name: km
    leantime_user_id: 9
    email: km@example.com
    type: sessions
settings:
  schedules:
    - id: weekday-check
      cron: "0 9 * * 1-5"
      prompt: check all
    - id: km-only
      cron: "0 10 * * 1"
      agents: [km]
      prompt: wiki
""".strip()
    )
    monkeypatch.setattr(mod, "AGENTS_YAML", agents_yaml)
    monkeypatch.setattr(mod, "BRIDGE_JSON", bridge_json)
    mod.main()
    bridge = json.loads(bridge_json.read_text())
    assert bridge["schedules"][0]["id"] == "weekday-check"
    assert "agents" not in bridge["schedules"][0]
    assert bridge["schedules"][1]["agents"] == ["km"]
