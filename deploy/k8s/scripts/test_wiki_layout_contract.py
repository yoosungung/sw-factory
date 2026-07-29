"""Contract: org-wiki uses wiki/ canonical; inbox deleted after promote."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # deploy/
REPO = Path(__file__).resolve().parents[3]
LAYOUT = (
    ROOT
    / "personas/_default/.cursor/skills/org-knowledge/references/wiki-layout.md"
)
PROMOTE = ROOT / "personas/km/.cursor/skills/knowledge-promote/SKILL.md"
ARCH = REPO / "ARCHITECTURE.md"


def test_wiki_layout_canonical_is_wiki_dir():
    text = LAYOUT.read_text()
    assert "wiki/" in text
    assert "INDEX.md" in text
    assert "inbox/{agent}/" in text
    assert "git rm" in text
    assert "no `_archived/`" in text or "no `_archived`" in text


def test_knowledge_promote_deletes_inbox_writes_wiki():
    text = PROMOTE.read_text()
    assert "`wiki/`" in text or "under **`wiki/`**" in text
    assert "git rm" in text
    assert "inbox/_archived/" in text  # forbidden mention


def test_architecture_29_matches():
    text = ARCH.read_text()
    section = text.split("### 2.9")[1].split("## 3.")[0]
    assert "`wiki/`" in section
    assert "삭제" in section
    assert "playbooks/" not in section
    assert "_archived" not in section
