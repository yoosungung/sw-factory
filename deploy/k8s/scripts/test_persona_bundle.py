"""Tests for persona bundle merge (_default/ + persona overlay)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from persona_bundle import (  # noqa: E402
    build_persona_bundle,
    bundle_for_configmap,
    decode_configmap_key,
    encode_configmap_key,
    merge_mcp,
    merge_memory,
)

PERSONAS_ROOT = SCRIPTS.parents[1] / "personas"


def test_merge_memory_appends_overlay():
    base = "# Defaults\n\n- Read MCP first\n"
    overlay = "# Persona: asky\n\n- Leantime: asky@example.com\n"
    merged = merge_memory(base, overlay)
    assert merged.startswith("# Defaults")
    assert "asky@example.com" in merged
    assert "\n\n# Persona" in merged


def test_merge_memory_returns_base_when_no_overlay():
    base = "# Defaults only\n"
    assert merge_memory(base, None) == base


def test_merge_mcp_deep_merges_servers():
    base = {"mcpServers": {"leantime": {"command": "leantime-mcp"}}}
    overlay = {"mcpServers": {"github": {"command": "github-mcp"}}}
    merged = merge_mcp(base, overlay)
    assert "leantime" in merged["mcpServers"]
    assert "github" in merged["mcpServers"]


def test_merge_mcp_persona_overrides_server_by_name():
    base = {"mcpServers": {"leantime": {"command": "leantime-mcp", "env": {"A": "1"}}}}
    overlay = {"mcpServers": {"leantime": {"env": {"B": "2"}}}}
    merged = merge_mcp(base, overlay)
    assert merged["mcpServers"]["leantime"] == {"env": {"B": "2"}}


def test_build_asky_bundle_includes_default_and_persona_memory():
    bundle = build_persona_bundle("asky", PERSONAS_ROOT)
    memory = bundle[".cursor/MEMORY.md"]
    assert "get_ticket" not in memory
    assert "Leantime:" in memory
    assert "asky" in memory.lower()


def test_build_path_bundle_drops_duplicate_collab_rules_from_persona_only():
    bundle = build_persona_bundle("path", PERSONAS_ROOT)
    memory = bundle[".cursor/MEMORY.md"]
    assert "add_comment" not in memory
    assert "path-graph" in memory


def test_build_bundle_includes_default_leantime_skill():
    bundle = build_persona_bundle("asky", PERSONAS_ROOT)
    skill_key = ".cursor/skills/leantime-collab/SKILL.md"
    assert skill_key in bundle
    skill = bundle[skill_key]
    assert "get_ticket" in skill
    assert "add_comment" in skill
    assert "update_ticket" in skill


def test_build_candy_bundle_includes_leantime_pm_skill():
    bundle = build_persona_bundle("candy", PERSONAS_ROOT)
    skill_key = ".cursor/skills/leantime-pm/SKILL.md"
    assert skill_key in bundle
    skill = bundle[skill_key]
    assert "metadata:\n  hermes:" not in skill
    assert "Hermes is the PM" not in skill
    assert "candy is the **PM**" in skill or "candy` is the **PM**" in skill or "candy is the PM" in skill.lower()
    assert "Use when acting as a Leantime project manager" in skill
    assert "30-Minute Developer Work Timebox" in skill
    assert "Human-only handoff" in skill
    assert "Waiting for Approval" in skill
    assert "human-only" in skill.lower()
    # Progressive disclosure: keep SKILL.md lean; heavy playbooks in references/.
    assert len(skill.splitlines()) < 200
    assert "## PM Workflow" not in skill
    assert "references/pm-workflow.md" in skill
    refs = [
        ".cursor/skills/leantime-pm/references/checkpoint-jsonrpc-status-probe.md",
        ".cursor/skills/leantime-pm/references/checkpoint-sql-status-probe.md",
        ".cursor/skills/leantime-pm/references/ticket-ops.md",
        ".cursor/skills/leantime-pm/references/pm-workflow.md",
        ".cursor/skills/leantime-pm/references/mention-watcher-review.md",
        ".cursor/skills/leantime-pm/references/pitfalls.md",
        ".cursor/skills/leantime-pm/references/path-graph-native-blocks-pm-review.md",
        ".cursor/skills/leantime-pm/references/path-graph-graphrag-closeout.md",
        ".cursor/skills/leantime-pm/references/path-graph-graphrag-runtime-closeout.md",
        ".cursor/skills/leantime-pm/references/path-graph-agent-bundle-post-merge.md",
    ]
    for key in refs:
        assert key in bundle, key
    ticket_ops = bundle[refs[2]]
    assert "Human-only privilege handoff" in ticket_ops
    assert "Waiting for Approval" in ticket_ops
    jsonrpc = bundle[refs[0]]
    assert "/opt/data/config.yaml" not in jsonrpc
    assert "LEANTIME_URL" in jsonrpc
    assert "LEANTIME_ACCESS_TOKEN" in jsonrpc


def test_build_infra_bundle_includes_k8s_operator_skill():
    bundle = build_persona_bundle("infra", PERSONAS_ROOT)
    skill_key = ".cursor/skills/k8s-operator-operations/SKILL.md"
    assert skill_key in bundle
    skill = bundle[skill_key]
    assert "metadata:\n  hermes:" not in skill
    assert "Operate Kubernetes clusters" in skill
    assert "kubectl" in skill
    assert "Prefer read-only" in skill or "read-only" in skill.lower()
    assert "k8s 운영 리포트" in skill
    assert len(skill.splitlines()) < 200
    memory = bundle[".cursor/MEMORY.md"]
    assert "k8s-operator-operations" in memory
    assert "infra" in memory.lower()
    refs = [
        ".cursor/skills/k8s-operator-operations/references/operator-rbac.md",
        ".cursor/skills/k8s-operator-operations/references/resource-monitoring-rbac.md",
        ".cursor/skills/k8s-operator-operations/references/health-checks.md",
        ".cursor/skills/k8s-operator-operations/references/service-smoke-tests.md",
        ".cursor/skills/k8s-operator-operations/references/postgres-temp-diskpressure.md",
        ".cursor/skills/k8s-operator-operations/references/argo-partial-rbac.md",
        ".cursor/skills/k8s-operator-operations/references/scheduled-reports.md",
        ".cursor/skills/k8s-operator-operations/references/deployment-patches.md",
    ]
    for key in refs:
        assert key in bundle, key


def test_persona_bundle_skips_sample_templates():
    bundle = build_persona_bundle("candy", PERSONAS_ROOT)
    assert "MEMORY.md.sample" not in bundle
    assert not any(k.endswith(".sample") for k in bundle)
    memory = bundle[".cursor/MEMORY.md"]
    assert "type: sessions" in memory
    assert "hermes (openai)" not in memory
    assert "leantime-pm" in memory


def test_build_bundle_includes_git_ship_skill():
    bundle = build_persona_bundle("runtime", PERSONAS_ROOT)
    skill_key = ".cursor/skills/git-ship/SKILL.md"
    assert skill_key in bundle
    skill = bundle[skill_key]
    assert "git push" in skill
    assert "push --force" in skill
    assert "push 해주세요" in skill or "push를 사람에게" in skill or "사람에게" in skill


def test_default_memory_includes_tool_class_policy():
    bundle = build_persona_bundle("runtime", PERSONAS_ROOT)
    memory = bundle[".cursor/MEMORY.md"]
    assert "Tool class policy" in memory
    assert "destructive" in memory
    assert "force" in memory.lower() or "금지" in memory


def test_agent_workflow_rule_requires_pod_ship():
    bundle = build_persona_bundle("asky", PERSONAS_ROOT)
    workflow = bundle[".cursor/rules/agent-workflow.mdc"]
    assert "git-ship" in workflow
    assert "push" in workflow


def test_build_bundle_includes_default_mcp_json():
    bundle = build_persona_bundle("runtime", PERSONAS_ROOT)
    mcp = json.loads(bundle[".cursor/mcp.json"])
    assert "leantime" in mcp["mcpServers"]
    assert mcp["mcpServers"]["leantime"]["command"] == "leantime-mcp"


def test_build_unknown_persona_uses_default_only(tmp_path: Path):
    default_dir = tmp_path / "_default"
    default_dir.mkdir()
    cursor_dir = default_dir / ".cursor"
    cursor_dir.mkdir()
    (default_dir / "MEMORY.md").write_text("# Default\n")
    (cursor_dir / "mcp.json").write_text('{"mcpServers": {}}\n')

    bundle = build_persona_bundle("missing", tmp_path)
    assert bundle[".cursor/MEMORY.md"] == "# Default\n"
    assert ".cursor/mcp.json" in bundle


def test_build_bundle_includes_default_cursor_rules():
    bundle = build_persona_bundle("asky", PERSONAS_ROOT)
    rule_key = ".cursor/rules/leantime-collab.mdc"
    assert rule_key in bundle
    assert "add_comment" in bundle[rule_key]
    workflow = bundle[".cursor/rules/agent-workflow.mdc"]
    assert "TDD" in workflow
    assert "Korean" in workflow


def test_build_path_bundle_includes_persona_rule_overlay():
    bundle = build_persona_bundle("path", PERSONAS_ROOT)
    assert ".cursor/rules/leantime-collab.mdc" in bundle
    path_rule = bundle[".cursor/rules/path-graph.mdc"]
    assert "path-graph" in path_rule


def test_configmap_key_roundtrip():
    path = ".cursor/skills/leantime-collab/SKILL.md"
    key = encode_configmap_key(path)
    assert "/" not in key
    assert not key.startswith(".")
    assert decode_configmap_key(key) == path


def test_bundle_for_configmap_encodes_nested_paths():
    bundle = build_persona_bundle("path", PERSONAS_ROOT)
    cm = bundle_for_configmap(bundle)
    assert "_dot_cursor__MEMORY.md" in cm
    assert "_dot_cursor__mcp.json" in cm
    assert "_dot_cursor__skills__leantime-collab__SKILL.md" in cm
    assert ".cursor/skills/leantime-collab/SKILL.md" not in cm
