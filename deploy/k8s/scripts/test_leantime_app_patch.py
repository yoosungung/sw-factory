"""#60: getStateLabels must resolve projectId before cache lookup."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parents[2]
PATCH = ROOT / "deploy/k8s/leantime-app-patch/Tickets.Repositories.php"


def test_get_state_labels_resolves_project_before_cache():
    text = PATCH.read_text()
    assert "function getStateLabels" in text
    fn_start = text.index("function getStateLabels")
    # Look at the method body start (until next public function)
    body = text[fn_start : fn_start + 800]
    resolve = body.index("session('currentProject')")
    cache = body.index("Cache::has('projectsettings.'")
    assert resolve < cache, "projectId must be resolved before Cache::has (#60)"


def test_patch_readme_documents_cm_apply():
    readme = (ROOT / "deploy/k8s/leantime-app-patch/README.md").read_text()
    assert "Tickets.Repositories.php" in readme
    assert "leantime-app-patch" in readme
    assert "volumeMount" in readme or "subPath" in readme
