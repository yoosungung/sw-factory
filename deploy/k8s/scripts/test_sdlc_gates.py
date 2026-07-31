"""M6–M9 SDLC gate artifacts present in the factory repo."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parents[2]  # deploy/k8s/scripts → repo root


def test_ci_has_fw_supply_chain_job():
    ci = (ROOT / ".github/workflows/ci.yml").read_text()
    assert "fw-supply-chain:" in ci
    assert "gitleaks" in ci
    assert "npm audit --audit-level=critical" in ci


def test_git_ship_merge_gate_and_test_evidence():
    skill = (
        ROOT / "deploy/personas/_default/.cursor/skills/git-ship/SKILL.md"
    ).read_text()
    assert "Merge 전 체크" in skill
    assert "gh pr checks" in skill
    assert "test: N/A" in skill or "browser: N/A" in skill


def test_intake_template_m8():
    path = (
        ROOT
        / "deploy/personas/pm/.cursor/skills/leantime-pm/references/intake-template.md"
    )
    text = path.read_text()
    assert "Acceptance criteria" in text
    assert "Architecture notes" in text


def test_pm_parent_done_requires_closed_subtasks():
    """Parent Done is forbidden while any canonical subtask is still open (#50)."""
    skill_root = ROOT / "deploy/personas/pm/.cursor/skills/leantime-pm"
    workflow = (skill_root / "references/pm-workflow.md").read_text()
    pitfalls = (skill_root / "references/pitfalls.md").read_text()
    ticket_ops = (skill_root / "references/ticket-ops.md").read_text()
    skill = (skill_root / "SKILL.md").read_text()
    assert "get_all_subtasks" in workflow
    assert "do not mark the parent done" in workflow.lower() or "부모 Done" in workflow
    assert "open subtask" in workflow.lower() or "열린" in workflow
    assert "parent done" in pitfalls.lower() or "부모 Done" in pitfalls
    assert "get_all_subtasks" in ticket_ops
    assert "Done/Archived" in ticket_ops or "Done or Archived" in ticket_ops
    assert (
        "open subtask" in skill.lower()
        or "열린 서브태스크" in skill
        or "열린 자식" in skill
    )


def test_incident_tickets_m9():
    path = (
        ROOT
        / "deploy/personas/ta/.cursor/skills/k8s-operator-operations/references/incident-tickets.md"
    )
    text = path.read_text()
    assert "CrashLoopBackOff" in text
    assert "github-issue-check" in text


def test_ta_daily_sample_mentions_incident_tickets():
    sample = (ROOT / "deploy/k8s/agents.yaml.sample").read_text()
    assert "incident-tickets.md" in sample
    assert "Actionable incidents are ticketed" in sample
