# Personas protocol (Dual-loop)

배달 규칙이 아니라 **cursor가 MCP로 일할 때**의 협업 규약.

## 역할

| name | 요지 |
|------|------|
| `pm` | intake·Review(intent)·Done 게이트·checkpoint |
| `km` | **org-wiki librarian** — `inbox/`→`wiki/`·INDEX (`org-knowledge`; 제품 SPA wiki UI는 Exclude) |
| `ta` | 배포/인프라·runtime check |
| `qa` | E2E·품질 |
| `aa` | 보안·클린코드 |
| developer sessions | 구현·PR |

공장 직원은 client에 묶이지 않을 수 있음(`agents.yaml`). 개발자는 repo/client 귀속 가능.

## 기능 루프

`backlog` → `in_progress` → `review` → `deploying_test` → `qa`(∥ aa) → `deploying_prod` → `done`  
(+ `blocked` / `waiting_for_approval`).  
Done은 코멘트 증거 마커(`test:`, `qa:`, `aa:`, `prod:`) — 백엔드 하드 게이트 없음.

## 공통

- 쓰기는 `add_comment` 우선; status-board는 `edit_comment` (웨이크 없음).
- description·comment body는 **Markdown(GFM)**.
- `@mention`으로 다음 담당 깨우기(실제 wake는 gateway가 comment 이벤트로 처리).
- self-echo는 gateway가 차단; agent는 불필요한 자기 재트리거 코멘트를 남기지 않는다.
- git ship/push는 봇이 수행 — `git-ship` 스킬.
- 조사는 **wiki-first** (`org-knowledge` · `ORG_WIKI_URL`); 작업 후 `wiki: inbox/…` 또는 `wiki: N/A`.
- FS 선행: `set_blocked_by`. Parent/child: `milestone_id` + `list_tickets?milestone_id=`.

## 번들

레포: [deploy/personas/](../../../deploy/personas/).  
런타임 시드: `_default` + persona overlay → `/data/workspaces/{persona}/` ([01-workspaces](01-workspaces.md)).  
레지스트리: `.cursor/clients-repos-registry.json` (공통), `.cursor/tenant-cd-registry.json` (ta), `.cursor/roadmap-registry.json` (pm).  
MCP 도구 계약: [05-factory-mcp](05-factory-mcp.md).
