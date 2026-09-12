# Persona bundles

`_default/` + `{persona}/` overlay. 시드: [agent/cursor/src/persona-bundle.ts](../../agent/cursor/src/persona-bundle.ts).  
`*.sample`은 레포 템플릿 — 시드 시 `MEMORY.md.sample` 내용을 workspace `MEMORY.md`로 seed-once.

| 디렉터리 | 역할 |
|----------|------|
| `_default/` | 공통 MEMORY·rules·skills (`factory-collab`, `org-knowledge`, `git-ship`, …) |
| `pm`/`ta`/`qa`/`aa`/`km` | persona overlay (`km` = org-wiki librarian) |

로컬 시드: [../local/seed-personas.sh](../local/seed-personas.sh).
