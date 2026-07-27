"""Validate CursorBridge schedule-tick CronJob manifest."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
CRONJOB = ROOT / "base" / "cronjob-schedule-tick.yaml"


def test_schedule_tick_cronjob():
    cron = yaml.safe_load(CRONJOB.read_text())
    assert cron["kind"] == "CronJob"
    assert cron["metadata"]["name"] == "cursorbridge-schedule-tick"
    assert cron["spec"]["schedule"] == "* * * * *"
    assert cron["spec"]["timeZone"] == "UTC"
    assert cron["spec"]["concurrencyPolicy"] == "Forbid"
    assert (
        cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["serviceAccountName"]
        == "cursorbridge-flush"
    )
    container = cron["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]
    assert "tick-schedules.php" in container["command"][-1]
