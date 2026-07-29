"""TDD: one-shot sw-factory install script contract."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts" / "install-sw-factory.sh"


def test_install_sw_factory_script_exists_and_wipes_safely():
    text = SCRIPT.read_text()
    assert "CURSORBRIDGE_NS" in text
    assert "--wipe" in text
    assert "seed_factory_users.py" in text
    assert "render-agents.sh" in text
    assert "overlays/sw-factory" in text
    assert "install-plugin-k8s.sh" in text
    assert "plugin:enable" in text
    assert "didim/cursor-bridge" in text
    assert "My Project" in text  # documents refusal/deletion
    # Must not wipe Leantime Helm by default
    assert "helm uninstall" not in text
    assert "delete namespace" not in text
    # Staff names after rename
    assert "statefulset/cursor-agent-" in text
    assert "pm km ta qa aa" in text
    assert "candy finder infra" in text  # wipe leftovers
