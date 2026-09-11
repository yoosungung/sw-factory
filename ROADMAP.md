# Roadmap

## 확정 결정

- Cloudflare Workers **네이티브 재작성** (PHP Containers 없음)
- MVP B: 인증, 프로젝트, 태스크, 마일스톤/칸반/타임라인, 코멘트, 파일 첨부
- 저장소: D1 + R2
- 설계 정본: [ARCHITECTURE.md](ARCHITECTURE.md)
- SPA **Prod IA** 정본: [frontend/ia/](frontend/ia/) ([overview](frontend/ia/overview.md) · [menus](frontend/ia/menus.md) · [pages](frontend/ia/pages.md) · [admin](frontend/ia/admin.md))
- Backend 설계: [backend/DESIGN.md](backend/DESIGN.md)

## Backend 마일스톤

| ID | 내용 | 완료 기준 | 상태 |
| --- | --- | --- | --- |
| **M0** | monorepo 스캐폴드 (Wrangler, Hono, Vitest, D1 마이그레이션, React+Vite Assets) | `npm test` / `npm run dev`로 health + 빈 UI | done |
| **M1** | 회원가입·로그인·로그아웃·세션 미들웨어 | 인증 API 테스트 green | done |
| **M2** | 프로젝트·태스크 CRUD + 멤버십 가드 | 비멤버 403, CRUD 테스트 green | done |
| **M3** | 마일스톤, 칸반, 타임라인 API + UI | status/sort_order·timeline 조회 동작 | done |
| **M4** | 코멘트 CRUD, R2 업로드/다운로드 | 메타+바이너리 분리 검증 | done |
| **M5** | Clients 도메인 (멀티 클라이언트) + project.client_id | client CRUD·멤버십·프로젝트 연결 테스트 green | done |
| **M6** | **협업 필수 체계** (100인 협업 코어): Client/Project 멤버 초대/제거 API, 티켓 담당자(`assignee_id`)·마감일(`due_at`)·우선순위(`priority`) 승격, 티켓 삭제 권한 가드(작성자/Owner 한정) | 멤버 관리 API 및 티켓 협업 필드/삭제 가드 테스트 green | done |
| **M7** | **대규모 데이터 & 인프라 내구성**: 티켓 Cursor 페이징, 칸반 완료(Done) 티켓 기간 필터/아카이빙, R2 Presigned Direct Upload, 만료 세션 정기 삭제 Scheduled Worker (Cron) | 페이징/대용량 업로드/세션 정리 테스트 green | done |
| **M8** | **동시성 & 이력 무결성**: 칸반/티켓 낙관적 락 (`version` 필드 및 409 충돌 처리), 티켓 변경 이력(`ticket_activities`) 추적 | 동시성 충돌 검증 및 이력 로그 조회 테스트 green | done |

## Frontend 마일스톤

화면 ID(F*)·메뉴·관리는 [frontend/ia/](frontend/ia/) 기준. 빈 stub 메뉴/관리 화면 금지. Backend `M*` 완료분만 연결한다.

| ID | 내용 (pages/menus/admin) | 완료 기준 | 의존 | 상태 |
| --- | --- | --- | --- | --- |
| **FE0** | **크롬·Auth**: Top nav(Spaces·Projects·Your work 직접 링크) / Project sidebar, F1 Auth | 세션 쿠키로 로그인·로그아웃·가드 라우트 | M1 | done |
| **FE1** | **Space·작업 뷰 코어**: F2 Projects, F4 Space hub, F5–F8 Board/Backlog/Timeline/List, F14 Quick Create, F15 Create Space·Project | `/` · `/clients/:id` · `/projects/:id?view=` + Create 모달 동작 | M3–M5 | done |
| **FE2** | **Issue 협업**: F9 Issue (`?issue=` / `/browse/:ticketId`) — assignee·due·priority, Comments·Files, 삭제 가드 UI | 협업 필드 인라인 저장·첨부·삭제 권한 반영 (History 탭은 FE6) | M6 | done |
| **FE3** | **개인·검색·계정**: F3 Your work, F13 Search, Account (`/account`) — 메뉴 stub 제거 | `/your-work` · `/search` · `/account` 실데이터 | M6 | done |
| **FE4** | **관리**: Space/Project settings (Details · People · Danger · Board 고정 컬럼 안내) | owner 가드·멤버 초대/역할/제거 UI; 빈 stub 없음 | M6 | done |
| **FE5** | **디렉터리·저장 뷰**: F10 Filters, F11 Dashboards, F12 Teams (Search/Your work/Space People에서 연결) | 실데이터 또는 local→서버 경로 명시·동작 (설계 승격 전 local 허용) | overview §5 승격 항목 | done |
| **FE6** | **규모·동시성 UX**: List/Board 커서 페이징·Done 기간 필터, Presigned 업로드, `version` 409 처리, Issue History 탭 | M7/M8 API에 맞춘 UI 검증 | M7, M8 | done |

권장 순서: **FE0 → FE1 → FE2 → FE4 → FE3 → FE5**, FE6은 M7/M8과 병행.

## Agent 마일스톤

내부망 coding agent. 설계 정본: [agent/gateway/](agent/gateway/) · [agent/cursor/](agent/cursor/). 계약: [ARCHITECTURE.md](ARCHITECTURE.md) §1.11–14.

| ID | 내용 | 완료 기준 | 상태 |
| --- | --- | --- | --- |
| **A0** | gateway/cursor 설계 문서·참고 스키마·구성도 | `agent/gateway/**` · `agent/cursor/**` 문서 존재; 루트 계약 링크 | done |
| **A1** | Worker `agent_event_log` + `GET /api/agent/events` | 마이그레이션·mutate append·pull API 테스트 green | done |
| **A2** | agent/gateway 구현 (tail·라우팅·localhost dispatch·retry/`acked_id`) | mock cursor에 이벤트→202 배달 E2E | done |
| **A3** | agent/cursor runner (pool·뮤텍스·persona cwd·PVC 경로) | mock MCP로 병렬 prompt·R1–R5 단위 테스트 | done |
| **A4** | factory-mcp + personas 시드 | 세션 쿠키로 티켓 읽기/코멘트; sample agents.yaml | planned |

## 범위 밖 (Exclude)

- timesheets, calendar / notifications
- canvas / ideas / wiki / goals
- plugins / settings, access_tokens (PAT)
- LDAP / OIDC, Hyperdrive / 외부 MySQL
- 전역 audit (Wiki/Canvas 배제로 불필요; 티켓 전용 이력은 M8·FE6)
- 위 도메인의 **UI 없음** ([frontend/ia README](frontend/ia/README.md))

## 후순위 (Defer — 미결정)

- Sprints (도메인·UI)
- 커스텀 status labels (고정 4컬럼 유지)
- 전역 RBAC (단순 `owner`\|`member` 유지)
- 고급 리포트; Issue History는 M8 승격 전 UI에 넣지 않음

## 진행 규칙

문서 변경 → 테스트 실패 → 구현 → 테스트 통과. API·스키마 계약은 ARCHITECTURE만 수정한다. SPA 화면·메뉴는 `frontend/ia/`를 먼저(또는 함께) 고친다.

- **개발 중:** 해당 마일스톤의 UI/플로우가 생기면 `e2e/` 시나리오를 함께 추가·갱신한다 ([e2e/DESIGN.md](e2e/DESIGN.md)).
- **마일스톤 종료:** 상태를 `done`으로 바꾸기 전에 `npm test` **및** `npm run test:e2e` green을 확인한다.

