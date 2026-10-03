# Frontend — Menus (Prod)

드롭다운·사이드바 크롬. Exclude 도메인은 메뉴에 넣지 않는다.

공통: Esc / 바깥 클릭으로 닫기. 활성 항목은 라우트 매칭.

---

## 1. Top navigation

백엔드 REST 표면에 1:1. 드롭다운 없이 **직접 링크**(Avatar만 예외). 활성 항목은 라우트 prefix 매칭.  
스타일: 48px 클린 라이트 크롬 (`#ffffff`, Slate 텍스트). 좁은 폭(`≤900px`)에서는 좌측 사이드바를 숨기고 햄버거 드로어로 대체 — **탑 링크(Spaces/Projects/Your work/Create) + 현재 Space/Project 컨텍스트(Overview·Tickets·Settings)** 를 함께 노출한다. 더 좁은 폭(`<768px`)에서는 검색 힌트 등 헤더만 추가로 압축.

```
[ Logo → / ]
[ Spaces ] [ Projects ] [ Your work ]
[ Create ] [ Search ⌘K ] [ Avatar ▾ ]
```

| 메뉴 | 경로 | API |
| --- | --- | --- |
| Spaces | `/spaces` | `GET /api/clients` |
| Projects | `/projects` | `GET /api/projects` |
| Your work | `/` (`/your-work` → `/`) | `GET /api/projects` + `…/tickets?assignee_id=me` · `…/tickets?created_by=me` |
| Search | `/search?q=` | `GET /api/search` |
| Create | Quick Create 모달 | `POST /api/projects/:id/tickets` (`status=backlog` 기본) |
| Avatar | `/account` · `/admin`(admin만) · logout | `GET/PATCH /api/users/me`, `GET /api/admin/users`, `POST /api/auth/logout` |

**Top nav에 두지 않음:** Filters(서버 리소스 없음, [pages F10](pages.md)에서 Search로 연결) · Teams(전용 API 없음 — People은 Space/Project settings).

---

## 2. Projects home (`/projects`) · Spaces (`/spaces`)

페이지 툴바(메뉴가 아님):

- Projects: Create space(**admin**) · Create project · name 검색
- Spaces: Create space(**admin**) · name 검색

---

## 3. Space sidebar / 헤더 (`/clients/:id`)

Space switcher와 본문 제목이 같은 이름을 두 번 쓰지 않는다. 설정은 프로젝트와 같이 **좌측 사이드바**.

```
[ ← Back to projects ]
[ Space Switcher ▾ ]
──────────── Settings
  Space settings → /clients/:id/settings/details
본문: 이름 · 설명 · [ Create project ] · 프로젝트 테이블
```

| 메뉴 | 경로 |
| --- | --- |
| Space settings | `/clients/:id/settings/details` |
| → Details | `.../settings/details` |
| → People | `.../settings/people` |
| → Delete | `.../settings/danger` (owner) |

헤더 People/⚙️는 두지 않는다. People은 Space settings.

---

## 4. Project sidebar (`/projects/:id`)

```
[ ← Back to projects ]     → `/projects` 또는 `/clients/:clientId`
[ Space Switcher ▾ ]       → 드롭다운 스위처 (사이드바 하단 전역 덤프 금지)
[ Icon · Project name ]
──────────── Work
  Overview                 → `/projects/:id` (이름·설명·수행 중 티켓)
  Tickets                  → `/projects/:id?view=board` (툴바 Board|Backlog|Timeline|List)
──────────── Settings
  Project settings → /projects/:id/settings/* (단일 셸 전환, 이중 사이드바 금지)
```

- **Overview ≠ Board:** Overview는 프로젝트 랜딩(이름·설명·`category=active` 티켓). Tickets가 작업 뷰.
- **뷰 전환 일원화:** Board/Backlog/Timeline/List는 **Tickets 툴바 세그먼트만**. 사이드바에 4뷰 링크를 두지 않는다.
- **전역 스페이스 덤프 금지:** 사이드바 하단에 시스템의 모든 스페이스를 수직 나열하지 않고, 상단 Space Switcher로 압축한다.
- **설정 셸:** `Project settings` 진입 시 프로젝트 사이드바를 숨기고, 설정 전용 단일 사이드바만 사용한다.

| 구역 | 항목 | 비고 |
| --- | --- | --- |
| Work | Overview · Tickets | 4대 뷰 전환은 Tickets 툴바 세그먼트 |
| Settings | Project settings | **단일 셸 관리** — [admin.md](admin.md) |
| Development | — | 비표시 |
| Think | Ideas/Wiki/Goals | **Exclude** |
| Time | Timesheets/Calendar | **Exclude** |

사이드바 collapse · Board fullscreen(`•••`).  
**좁은 폭:** 고정 사이드바가 사라질 때(≤900px) 동일 Work/Settings 링크는 탑 햄버거 드로어에 포함한다 — Settings에 도달할 수 없는 상태를 만들지 않는다.

### Project settings 하위 메뉴

| 항목 | 경로 | 권한 |
| --- | --- | --- |
| Details | `.../settings/details` | member 조회, member 수정 |
| People | `.../settings/people` | owner: 검색·추가·Access/Lane·제거 |
| Board | `.../settings/board` | 컬럼 라벨 고정 안내(커스텀 컬럼 Exclude) |
| Danger zone | `.../settings/danger` | owner: 삭제 |

---

## 5. Tickets 툴바 — Agent prompt

Tickets 뷰(`?view=board|backlog|timeline|list`) 툴바에 **Prompt agent** 버튼. 클릭 → [pages F16](pages.md) 모달(project 스코프, `ticket_id` 없음).  
Issue 인스펙터 헤더에도 동일 액션 — 열릴 때 현재 이슈 `ticket_id`를 기본값으로 넣는다.

---

## 6. Issue 열기 모드 (보드 `•••`)

| 모드 | 경로/파라미터 | 인터랙션 규격 ([design-system §3.6](design-system.md#36-issue-panel-non-modal-inspector-vs-centered-modal)) |
| --- | --- | --- |
| **Open in sidebar (기본)** | `?issue=` | **논모달 사이드 인스펙터** (오버레이 딤 없음, 보드 카드 클릭 시 즉시 전환) |
| **Open in modal** | `?issue=&issueUi=modal` | **집중 중앙 모달** (어두운 배경 딤, 독립 팝업) |
| **Open full page** | `/browse/:ticketId` | 메인 전폭 단독 뷰 · 닫기 아이콘/Esc → Board |
| **Full screen board** | — | 사이드바 숨김 전폭 보드 |

---

## 7. 메뉴 ↔ 도메인

| 메뉴 표면 | Backend | Prod |
| --- | --- | --- |
| Auth / Avatar | auth, users | Adopt |
| Spaces | clients | Adopt |
| Projects | projects | Adopt |
| Planning views / Issue | tickets, comments, files | Adopt |
| Agent prompt (Tickets/Issue) | `POST /api/agent/prompts` | Adopt |
| Your work | tickets `assignee_id=me` · `created_by=me` | Adopt |
| Search | `GET /api/search` | Adopt |
| People (settings) | client_members, project_members | Adopt |
| Filters | local + tickets 조합 (Top nav 없음) | FE5 local |
| Calendar, Ideas, Timesheets, Notifications, Plugins, Tokens | — | Exclude |
