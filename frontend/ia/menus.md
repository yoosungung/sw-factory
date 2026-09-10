# Frontend — Menus (Prod)

드롭다운·사이드바 크롬. Exclude 도메인은 메뉴에 넣지 않는다.

공통: Esc / 바깥 클릭으로 닫기. 활성 항목은 라우트 매칭.

---

## 1. Top navigation

백엔드 REST 표면에 1:1. 드롭다운 없이 **직접 링크**(Avatar만 예외). 활성 항목은 라우트 prefix 매칭.

```
[ Logo → / ]
[ Spaces ] [ Projects ] [ Your work ]
[ Create ] [ Search ] [ Avatar ▾ ]
```

| 메뉴 | 경로 | API |
| --- | --- | --- |
| Spaces | `/spaces` | `GET /api/clients` |
| Projects | `/` | `GET /api/projects` |
| Your work | `/your-work` | `GET /api/projects` + `…/tickets?assignee_id=me` |
| Search | `/search?q=` | `GET /api/search` |
| Create | Quick Create 모달 | `POST /api/projects/:id/tickets` |
| Avatar | `/account` · logout | `GET/PATCH /api/users/me`, `POST /api/auth/logout` |

**Top nav에 두지 않음:** Filters · Dashboards(서버 리소스 없음, [pages F10·F11](pages.md)에서 Search/Your work로 연결) · Teams(전용 API 없음 — People은 Space/Project settings).

### 1.1 Spaces

→ `/spaces`. 행 → Space hub `/clients/:id`. Create space → `POST /api/clients`.

### 1.2 Projects

→ `/`. 내가 멤버인 프로젝트 목록. 행 → `/projects/:id?view=board` (Space hub 경유 생략). Create space / Create project.

### 1.3 Your work

→ `/your-work`. Assigned / Recently viewed / Recent projects.

### 1.4 Search

| 동작 | |
| --- | --- |
| 클릭/⌘K | Search 팝오버 또는 `/search?q=` |
| 범위 | Projects, Clients(Spaces), Tickets(title) |

### 1.5 Create

전역 **Quick Create** 모달 — [pages F14](pages.md).  
기본 Project = 현재 `/projects/:id` 또는 최근.

### 1.6 Avatar ▾

| 항목 | 동작 |
| --- | --- |
| Account | → `/account` |
| Log out | `POST /api/auth/logout` |

**넣지 않음:** Notifications, API tokens, Plugins, Admin 플러그인 설정 (Exclude).

---

## 2. Projects home (`/`) · Spaces (`/spaces`)

페이지 툴바(메뉴가 아님):

- Projects: Create space · Create project · name 검색
- Spaces: Create space · name 검색

---

## 3. Space sidebar / 헤더 (`/clients/:id`)

```
Breadcrumb: Projects / {Space}
[ Space name ] [ Create project ] [ ⚙️ Space settings ]
테이블: projects
```

| 메뉴 | 경로 |
| --- | --- |
| Space settings ▾ 또는 ⚙️ | `/clients/:id/settings/details` |
| → Details | `.../settings/details` |
| → People | `.../settings/people` |
| → Delete | `.../settings/danger` (owner) |

Space hub 컨텍스트.

---

## 4. Project sidebar (`/projects/:id`)

```
[ ← Back to projects ]     → `/` 또는 `/clients/:clientId`
[ Icon · Project name ]
[ Software ]
──────────── Planning
  Timeline     ?view=timeline
  Backlog      ?view=backlog
  Board        ?view=board   ← 기본 랜딩
  List         ?view=list
────────────
  Project settings → /projects/:id/settings/*
```

| 구역 | 항목 | 비고 |
| --- | --- | --- |
| Planning | Timeline, Backlog, Board, List | 작업 뷰 전환 |
| Development | — | 비표시 |
| Think | Ideas/Wiki/Goals | **Exclude** |
| Time | Timesheets/Calendar | **Exclude** |
| Settings | Project settings | **관리** — [admin.md](admin.md) |

사이드바 collapse · Board fullscreen(`•••`).

### Project settings 하위 메뉴

| 항목 | 경로 | 권한 |
| --- | --- | --- |
| Details | `.../settings/details` | member 조회, member 수정 |
| People | `.../settings/people` | owner: 초대·역할·제거 |
| Board | `.../settings/board` | 컬럼 라벨 고정 안내(커스텀 컬럼 Exclude) |
| Danger zone | `.../settings/danger` | owner: 삭제 |

---

## 5. Issue 열기 모드 (보드 `•••`)

| 모드 | |
| --- | --- |
| Open in sidebar | `?issue=` |
| Open in modal | `?issue=&issueUi=modal` |
| Open full page | `/browse/:ticketId` |
| Full screen board | 사이드바 숨김 |

---

## 6. 메뉴 ↔ 도메인

| 메뉴 표면 | Backend | Prod |
| --- | --- | --- |
| Auth / Avatar | auth, users | Adopt |
| Spaces | clients | Adopt |
| Projects | projects | Adopt |
| Planning views / Issue | tickets, comments, files | Adopt |
| Your work | tickets `assignee_id=me` | Adopt |
| Search | `GET /api/search` | Adopt |
| People (settings) | client_members, project_members | Adopt |
| Filters / Dashboards | local + tickets 조합 (Top nav 없음) | FE5 local |
| Calendar, Ideas, Timesheets, Notifications, Plugins, Tokens | — | Exclude |
