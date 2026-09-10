# Frontend — Menus (Prod)

드롭다운·사이드바 크롬. Exclude 도메인은 메뉴에 넣지 않는다.

공통: Esc / 바깥 클릭으로 닫기. 활성 항목은 라우트 매칭.

---

## 1. Top navigation

```
[ Logo → / ]
[ Your work ▾ ] [ Projects ▾ ] [ Filters ▾ ] [ Dashboards ▾ ] [ Teams ▾ ]
[ Search ] [ Create ] [ Avatar ▾ ]
```

### 1.1 Your work ▾

| 항목 | 동작 |
| --- | --- |
| 최근 프로젝트 (N) | → `/projects/:id?view=board` |
| Worked on / Assigned to me (요약) | → `/your-work` |
| View all your work | → `/your-work` |

데이터: local recent + `GET /api/projects` + assignee 필터 티켓 (`GET /api/projects/:id/tickets?assignee_id=me`, ARCHITECTURE §4 승격).

### 1.2 Projects ▾

| 항목 | 동작 |
| --- | --- |
| 최근 프로젝트 | → `/projects/:id` |
| View all projects | → `/` |
| **Create project** | Space(Client) 생성 다이얼로그 → `/clients/:id` |

### 1.3 Filters ▾

| 항목 | 동작 |
| --- | --- |
| Starred / 최근 필터 | → `/filters/:id` |
| View all filters | → `/filters` |
| **Create filter** | → `/filters/new` |

실데이터(저장 필터). stub 문구만 두지 않는다. 스키마 승격 전엔 브라우저 로컬 + 마이그레이션 경로를 설계에 명시([pages F10](pages.md)).

### 1.4 Dashboards ▾

| 항목 | 동작 |
| --- | --- |
| 기본 / 최근 대시보드 | → `/dashboards/:id` |
| View all dashboards | → `/dashboards` |
| Create dashboard | → `/dashboards/new` |

위젯: My open issues, Recent projects, Done this week(status 이력 없을 때 `updated_at`+done 근사).

### 1.5 Teams ▾

| 항목 | 동작 |
| --- | --- |
| People directory | → `/teams` |
| (컨텍스트) 현재 Space/Project 멤버 바로가기 | → 해당 settings/people |

전역 RBAC 없음.

### 1.6 Search

| 동작 | |
| --- | --- |
| 클릭/⌘K | Search 팝오버 또는 `/search?q=` |
| 범위 | Projects, Clients(Spaces), Tickets(title) |

### 1.7 Create

전역 **Quick Create** 모달 — [pages F14](pages.md).  
기본 Project = 현재 `/projects/:id` 또는 최근.

### 1.8 Avatar ▾

| 항목 | 동작 |
| --- | --- |
| Profile | → `/account` |
| Account settings | → `/account` (프로필·비밀번호) |
| Log out | `POST /api/auth/logout` |

**넣지 않음:** Notifications, API tokens, Plugins, Admin 플러그인 설정 (Exclude).

---

## 2. Projects home 컨텍스트 (`/`)

페이지 툴바(메뉴가 아님):

- Create project (Space)
- 검색/필터: name

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
| Auth / Avatar | auth | Adopt |
| Projects / Space | clients, projects | Adopt |
| Planning views / Issue | tickets, comments, files | Adopt |
| Your work / Search / Filters | tickets (+ assignee 승격) | Prod |
| Teams / People settings | client_members, project_members | Prod·API 보강 |
| Dashboards | 집계·list 조합 | Prod |
| Calendar, Ideas, Timesheets, Notifications, Plugins, Tokens | — | Exclude |
