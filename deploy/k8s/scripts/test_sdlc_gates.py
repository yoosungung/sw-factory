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
        / "deploy/personas/candy/.cursor/skills/leantime-pm/references/intake-template.md"
    )
    text = path.read_text()
    assert "Acceptance criteria" in text
    assert "Architecture notes" in text


def test_incident_tickets_m9():
    path = (
        ROOT
        / "deploy/personas/infra/.cursor/skills/k8s-operator-operations/references/incident-tickets.md"
    )
    text = path.read_text()
    assert "CrashLoopBackOff" in text
    assert "github-issue-check" in text


def test_infra_daily_sample_mentions_incident_tickets():
    sample = (ROOT / "deploy/k8s/agents.yaml.sample").read_text()
    assert "incident-tickets.md" in sample
    assert "Actionable incidents are ticketed" in sample
