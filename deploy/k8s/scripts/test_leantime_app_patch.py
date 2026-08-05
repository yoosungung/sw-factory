"""#60: getStateLabels must resolve projectId before cache lookup.
Filename cards: showAll overlays must not hard-truncate to 10 chars.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parents[2]
PATCH_DIR = ROOT / "deploy/k8s/leantime-app-patch"
PATCH = PATCH_DIR / "Tickets.Repositories.php"
SHOWALL_SUB = PATCH_DIR / "showAll.submodules.blade.php"
SHOWALL = PATCH_DIR / "showAll.blade.php"


def test_get_state_labels_resolves_project_before_cache():
    text = PATCH.read_text()
    assert "function getStateLabels" in text
    fn_start = text.index("function getStateLabels")
    # Look at the method body start (until next public function)
    body = text[fn_start : fn_start + 800]
    resolve = body.index("session('currentProject')")
    cache = body.index("Cache::has('projectsettings.'")
    assert resolve < cache, "projectId must be resolved before Cache::has (#60)"


def test_showall_overlays_show_full_filename():
    truncate = "substr($file['realName'], 0, 10)"
    full = "{{ $file['realName'] }}.{{ $file['extension'] }}"
    for path in (SHOWALL_SUB, SHOWALL):
        text = path.read_text()
        assert truncate not in text, f"{path.name} still truncates realName"
        assert full in text, f"{path.name} must render full realName.extension"


def test_patch_readme_documents_cm_apply():
    readme = (PATCH_DIR / "README.md").read_text()
    assert "Tickets.Repositories.php" in readme
    assert "showAll.submodules.blade.php" in readme
    assert "leantime-app-patch" in readme
    assert "volumeMount" in readme or "subPath" in readme
