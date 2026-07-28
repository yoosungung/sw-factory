"""Tests for seed-persona: MEMORY.md seed-once, other files always refresh."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
SEED_SCRIPT = SCRIPTS / "seed_persona.sh"
ROOT = SCRIPTS.parents[2]
SS_TPL = ROOT / "deploy/k8s/templates/statefulset.yaml.tpl"


def _run_seed(persona: Path, cursor_home: Path) -> None:
    env = os.environ.copy()
    env["PERSONA_SRC"] = str(persona)
    env["CURSOR_HOME"] = str(cursor_home)
    subprocess.run(["sh", str(SEED_SCRIPT)], check=True, env=env)


def _inject_seed_into_template() -> str:
    lines: list[str] = []
    for line in SEED_SCRIPT.read_text().splitlines():
        if line.startswith("#!"):
            continue
        lines.append(("              " + line) if line else "")
    return SS_TPL.read_text().replace("{{SEED_PERSONA_SCRIPT}}", "\n".join(lines))


def test_seed_preserves_existing_memory(tmp_path: Path) -> None:
    persona = tmp_path / "persona"
    home = tmp_path / "home"
    persona.mkdir()
    home.mkdir()
    (persona / "_dot_cursor__MEMORY.md").write_text("# seed\n")
    mem = home / ".cursor" / "MEMORY.md"
    mem.parent.mkdir(parents=True)
    mem.write_text("# runtime edit\n")

    _run_seed(persona, home)

    assert mem.read_text() == "# runtime edit\n"


def test_seed_creates_memory_when_missing(tmp_path: Path) -> None:
    persona = tmp_path / "persona"
    home = tmp_path / "home"
    persona.mkdir()
    home.mkdir()
    (persona / "_dot_cursor__MEMORY.md").write_text("# seed\n")

    _run_seed(persona, home)

    assert (home / ".cursor" / "MEMORY.md").read_text() == "# seed\n"


def test_seed_overwrites_non_memory_files(tmp_path: Path) -> None:
    persona = tmp_path / "persona"
    home = tmp_path / "home"
    persona.mkdir()
    home.mkdir()
    (persona / "_dot_cursor__mcp.json").write_text('{"v":2}\n')
    mcp = home / ".cursor" / "mcp.json"
    mcp.parent.mkdir(parents=True)
    mcp.write_text('{"v":1}\n')

    _run_seed(persona, home)

    assert mcp.read_text() == '{"v":2}\n'


def test_statefulset_template_has_seed_placeholder() -> None:
    assert "{{SEED_PERSONA_SCRIPT}}" in SS_TPL.read_text()
    script = SEED_SCRIPT.read_text()
    assert ".cursor/MEMORY.md" in script
    assert '[ ! -f "$CURSOR_HOME/$dest" ]' in script


def test_render_injection_keeps_memory_seed_once() -> None:
    """Same substitution render-agents.sh applies must keep MEMORY branch."""
    injected = _inject_seed_into_template()
    assert "{{SEED_PERSONA_SCRIPT}}" not in injected
    assert ".cursor/MEMORY.md)" in injected
    assert '[ ! -f "$CURSOR_HOME/$dest" ]' in injected
    assert 'case "$dest" in' in injected
