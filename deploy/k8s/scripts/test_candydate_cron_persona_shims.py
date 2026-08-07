"""Candydate skill scripts in persona ConfigMaps must be thin shims (ticket 308).

Stale full copies (nohup + bare exec on 0644 PVC) → empty worker.log → monitor exit 99.
SSoT lives in candidate.win agent/cron/; persona seed must exec-bash/python3 into that tree.
"""

from __future__ import annotations

import textwrap

SHIM_SCRIPT_KEYS = (
    "candydate_pass_ab_launcher.sh",
    "candydate_pass_ab_monitor.sh",
    "candydate_pass_ab_worker.sh",
    "candydate_pass_d_watchdog.sh",
    "test_pass_ab_launcher_detach.sh",
)


def _cm_key(name: str) -> str:
    return f"_dot_cursor__skills__candydate-cron__scripts__{name}"


def assert_candydate_cron_entries_are_thin_shims(data: dict[str, str]) -> None:
    """Raise AssertionError if any candydate-cron script key is a stale full copy."""
    for name in SHIM_SCRIPT_KEYS:
        key = _cm_key(name)
        if key not in data:
            continue
        body = data[key]
        assert "nohup" not in body, f"{key}: stale nohup launcher"
        assert "exec bash" in body and "/agent/cron/" in body, f"{key}: not thin sh shim"
        assert len(body) < 400, f"{key}: body too large for shim ({len(body)})"

    paths_key = _cm_key("paths.sh")
    if paths_key in data:
        body = data[paths_key]
        assert "agent/cron/paths.sh" in body, f"{paths_key}: not thin paths shim"
        assert "nohup" not in body

    py_key = _cm_key("leantime_cron_report.py")
    if py_key in data:
        body = data[py_key]
        assert "exec python3" in body and "agent/cron/leantime_cron_report.py" in body
        assert len(body) < 400


def test_thin_shim_fixture_passes() -> None:
    data = {
        _cm_key("candydate_pass_ab_launcher.sh"): textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            exec bash "${CANDYDATE_REPO:-/workspace/repo}/agent/cron/candydate_pass_ab_launcher.sh" "$@"
            """
        ),
        _cm_key("paths.sh"): textwrap.dedent(
            """\
            # Runtime shim → repo agent/cron/paths.sh
            _CANDYDATE_CRON="${CANDYDATE_REPO:-/workspace/repo}/agent/cron"
            source "$_CANDYDATE_CRON/paths.sh"
            CANDYDATE_SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
            """
        ),
        _cm_key("leantime_cron_report.py"): textwrap.dedent(
            """\
            #!/usr/bin/env bash
            set -euo pipefail
            exec python3 "${CANDYDATE_REPO:-/workspace/repo}/agent/cron/leantime_cron_report.py" "$@"
            """
        ),
        _cm_key("candydate.env"): "CANDYDATE_LEANTIME_PROJECT_ID=7\n",
    }
    assert_candydate_cron_entries_are_thin_shims(data)


def test_stale_full_launcher_fails() -> None:
    stale = {
        _cm_key("candydate_pass_ab_launcher.sh"): (
            "#!/usr/bin/env bash\n"
            "nohup bash \"$WORKER\" >>\"$WORKER_LOG\" 2>&1 &\n"
            + ("x" * 500)
        )
    }
    try:
        assert_candydate_cron_entries_are_thin_shims(stale)
    except AssertionError as exc:
        assert "nohup" in str(exc) or "too large" in str(exc) or "thin" in str(exc)
    else:
        raise AssertionError("expected stale launcher to fail")


def test_missing_candydate_keys_ok() -> None:
    assert_candydate_cron_entries_are_thin_shims({"_dot_cursor__mcp.json": "{}\n"})
