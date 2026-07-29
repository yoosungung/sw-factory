"""Candydate Phase B: seewin path remaps + schedule ids."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
AGENTS = ROOT / "deploy" / "k8s" / "agents.yaml"
AGENTS_SAMPLE = ROOT / "deploy" / "k8s" / "agents.yaml.sample"
SCRIPTS = (
    ROOT
    / "deploy"
    / "personas"
    / "seewin"
    / ".cursor"
    / "skills"
    / "candydate-cron"
    / "scripts"
)
CRONJOB = ROOT / "deploy" / "k8s" / "base" / "cronjob-candydate.yaml"
SKILL = (
    ROOT
    / "deploy"
    / "personas"
    / "seewin"
    / ".cursor"
    / "skills"
    / "political-wiki-administration"
    / "SKILL.md"
)


def test_candydate_scripts_use_seewin_paths() -> None:
    paths = (SCRIPTS / "paths.sh").read_text()
    assert "/workspace/repo" in paths
    assert "/cursor-home/candydate/state" in paths
    assert "/opt/data" not in paths
    assert "/workspace/shared/candidate.win" not in paths

    for name in (
        "candydate_pass_ab_launcher.sh",
        "candydate_pass_ab_worker.sh",
        "candydate_pass_ab_monitor.sh",
        "candydate_pass_d_watchdog.sh",
    ):
        text = (SCRIPTS / name).read_text()
        assert "/workspace/shared/candidate.win" not in text
        assert "/opt/data/scripts" not in text


def test_leantime_cron_report_defaults_to_seewin_user() -> None:
    text = (SCRIPTS / "leantime_cron_report.py").read_text()
    assert 'CANDYDATE_LEANTIME_USER_ID", "14"' in text
    assert "cron,candydate,seewin" in text


def test_seewin_llm_schedules_registered() -> None:
    path = AGENTS if AGENTS.is_file() else AGENTS_SAMPLE
    data = yaml.safe_load(path.read_text())
    by_id = {s["id"]: s for s in data["settings"]["schedules"]}
    for sid, cron in (
        ("seewin-people-curation", "0 9 * * *"),
        ("seewin-publication-review", "0 18 * * *"),
        ("seewin-issue-radar-today", "0 23 * * *"),
    ):
        assert sid in by_id
        assert by_id[sid]["cron"] == cron
        assert by_id[sid]["agents"] == ["seewin"]
        assert "/workspace/repo" in by_id[sid]["prompt"]
    for sid in ("seewin-people-curation", "seewin-publication-review"):
        assert "user_id=14" in by_id[sid]["prompt"] or "user 14" in by_id[sid]["prompt"]
    radar = by_id["seewin-issue-radar-today"]["prompt"]
    assert "No Leantime tickets" in radar or "티켓" in radar


def test_candydate_cronjobs_manifest() -> None:
    text = CRONJOB.read_text()
    assert "candydate-pass-ab-launch" in text
    assert "candydate-pass-ab-monitor" in text
    assert "candydate-pass-d" in text
    assert "0 12 * * *" in text
    assert "*/10 * * * *" in text
    assert "0 15,16,17 * * *" in text
    # SA cursorbridge-flush has pods get/list/exec only — no statefulsets get.
    # Match flush-retries: resolve Pod by label, then exec by name.
    assert "statefulset/cursor-agent-seewin" not in text
    assert "app=cursor-agent,persona=seewin" in text
    assert text.count("get pod -l app=cursor-agent,persona=seewin") == 3
    assert text.count('jsonpath=\'{.items[0].metadata.name}\'') == 3
    assert "candydate_pass_ab_launcher.sh" in text
    assert "candydate_pass_ab_monitor.sh" in text
    assert "candydate_pass_d_watchdog.sh" in text


def test_political_wiki_skill_present() -> None:
    assert SKILL.is_file()
    assert "political" in SKILL.read_text()[:500].lower() or SKILL.stat().st_size > 1000
