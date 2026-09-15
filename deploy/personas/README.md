# Persona bundles

`_default/` + `{persona}/` overlay. 시드: [agent/cursor/src/persona-bundle.ts](../../agent/cursor/src/persona-bundle.ts).  
`*.sample`은 레포 템플릿 — 시드 시 `MEMORY.md.sample` 내용을 workspace `MEMORY.md`로 seed-once.

| 디렉터리 | 역할 |
|----------|------|
| `_default/` | 공통 MEMORY·rules·skills (`factory-collab`, `org-knowledge`, `git-ship`, …) |
| `pm`/`ta`/`qa`/`aa`/`km` | persona overlay (`km` = org-wiki librarian) |

**Docker:** 이미지 빌드가 overlay를 머지해 `/opt/persona-seed/{persona}/`로 준비한다(최종 이미지에 이 원본 트리는 없음). 런타임 cwd는 `/data/workspaces/{persona}/`.  
로컬 시드(쿠키+mcp): [../local/seed-personas.sh](../local/seed-personas.sh).
