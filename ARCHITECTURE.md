# Architecture

sw-factory(Auth, Clients, Projects, Tickets/Milestones, Comments, Files)를 Cloudflare Workers에서 구현한다.  
코딩 agent(내부망)는 티켓 시스템의 **일반 유저**로 접속한다.  
컴포넌트 설계: [backend/DESIGN.md](backend/DESIGN.md) · [frontend/DESIGN.md](frontend/DESIGN.md) · [frontend/ia/](frontend/ia/) · [agent/gateway/](agent/gateway/) · [agent/cursor/](agent/cursor/).

## 1. 계약사항

1. 브라우저·외부 클라이언트는 **Worker HTTP API만** 호출한다. D1·R2에 직접 접근하지 않는다. (단, R2 Presigned URL을 통한 다이렉트 바이너리 전송은 예외적으로 허용)
2. 인증은 **HttpOnly + Secure + SameSite=Lax** 세션 쿠키와 D1 `sessions` 행으로 유지한다. JWT를 기본으로 쓰지 않는다. **코딩 agent도 동일** — email/password 로그인 후 세션 쿠키(PAT/`x-api-key` 신설 없음).
3. **Client**는 고객사/조직 단위다. Client 리소스는 **client_members** 멤버십이 없으면 거부한다(fail-closed). **Space 생성(`POST /api/clients`)은 플랫폼 admin만** 가능하고, 생성자가 해당 client의 `owner`가 된다. `owner`만 client 삭제·멤버 관리(초대/역할변경/제거)가 가능하다.
4. **Project**는 반드시 하나의 `client_id`에 속한다. 프로젝트 생성 시 해당 client의 멤버여야 한다. 프로젝트 리소스 접근은 **project_members** 기준 fail-closed. `owner`만 프로젝트 삭제·멤버 관리(초대/역할변경/제거)가 가능하다.
5. 첨부 **바이너리는 R2만** 저장한다. D1 `files`에는 메타데이터(key, mime, size, entity)만 둔다. 대용량은 `upload-url` → 임시 PUT(`direct-upload`) → `confirm` 흐름을 지원한다.
6. 작업 단위는 `tickets` 한 테이블이며 `type`이 `task` | `milestone`이다. 마일스톤은 동일 CRUD 규칙을 따른다. 협업을 위해 `assignee_id`, `due_at`, `priority`, 동시성 제어를 위한 `version`을 필수 메타데이터로 관리한다.
7. 티켓 삭제(`DELETE /api/tickets/:id`)는 데이터 유실 방지를 위해 **작성자(`created_by`) 본인 또는 프로젝트 `owner`만** 허용한다. 일반 멤버는 삭제 불가.
8. 대량 데이터 및 동시성: 티켓 목록은 Cursor 기반 페이징을 지원하며, 칸반은 활성 티켓 중심(완료건은 최근 기간 필터)으로 조회한다. 티켓 수정 시 낙관적 락(Optimistic Concurrency Control, `version` 필드)을 지원한다.
9. 스키마·REST·권한 규칙을 바꿀 때는 이 문서를 코드와 **함께(또는 먼저)** 갱신한다.
10. **범위 밖(Exclude):** LDAP/OIDC, Hyperdrive, timesheets, calendar, notifications, canvas/ideas/wiki/goals, plugins, 전역 settings 키-값, access_tokens(PAT/`x-api-key`), 계정별 CRUD 매트릭스(전역 permission scheme). 인증은 세션 쿠키만.
11. **Agent wake = pull:** Worker는 내부망 agent로 HTTP push하지 않는다. 티켓 mutate 시 D1 `agent_event_log`에 append하고, 내부망 **[agent/gateway](agent/gateway/)** 가 outbound로 tail한다.
12. **gateway vs cursor:** gateway는 이벤트→prompt **배달만**(라우팅·self-echo·debounce·retry). **[agent/cursor](agent/cursor/)** 는 localhost runner + **factory-mcp**로 티켓을 읽고 작업한다. gateway는 MCP/티켓 mutate를 하지 않는다.
13. **단일 컨테이너 병렬:** agent Pod/컨테이너는 기본 1개. cursor는 parent(SDK 미로드) + **공유 SDK worker pool**; `ticket_id` 뮤텍스; 기본 `max_active_per_persona=1`. prompt는 **202** 비차단; gateway `acked_id`는 성공 accept 후에만 전진.
14. **PVC:** 볼륨 **1개 공유**(`/data`). 작업 상태는 **경로 격리** — `gateway/` vs `workspaces/{persona}/`(MEMORY·chats·git·세션 쿠키 비공유). persona별 PVC N개는 후순위.
15. **플랫폼 admin:** `users.is_admin`. 가입(`POST /api/auth/register`)은 열려 있으나 가입만으로는 Space가 없다. admin이 Space People에 초대한 뒤에야 리소스에 접근한다. Ticket/Comment CRUD는 계정별 체크박스가 아니라 Space/Project `owner`|`member`(및 작성자 삭제 가드)로만 결정한다. 시드 admin은 `ADMIN_EMAIL`+`ADMIN_PASSWORD`(없으면 만들지 않음). 마지막 admin은 강등할 수 없다.

## 2. 컴포넌트

| 컴포넌트 | 경로 | 역할 | Bindings / 비고 |
| --- | --- | --- | --- |
| API Worker | `backend/` | Hono REST, 세션, 도메인 로직, `agent_event_log` append | `DB`(D1), `FILES`(R2), `SESSION_SECRET`, `ADMIN_EMAIL`/`ADMIN_PASSWORD`(시드) |
| SPA | `frontend/` | React UI | Workers Assets (`ASSETS`) |
| Deploy | `deploy/` | Wrangler·마이그레이션·시크릿 런북 | — |
| Agent gateway | `agent/gateway/` | event log pull · 라우팅 · cursor에 prompt | 내부망; `/data/gateway` |
| Agent cursor | `agent/cursor/` | SDK pool · persona workspaces · factory-mcp | 내부망; `/data/workspaces/*` |

요청 흐름: `Browser` → Assets(SPA) → `/api/*`는 Worker first → D1 / R2.  
Agent 흐름: Worker → `agent_event_log` ← gateway pull → cursor prompt → MCP/REST(세션) → Worker.

## 3. D1 스키마

```sql
-- users
id TEXT PRIMARY KEY,
email TEXT NOT NULL UNIQUE COLLATE NOCASE,
password_hash TEXT NOT NULL,
name TEXT NOT NULL,
is_admin INTEGER NOT NULL DEFAULT 0,  -- 0|1 플랫폼 admin
created_at TEXT NOT NULL

-- sessions
id TEXT PRIMARY KEY,          -- opaque cookie value
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
expires_at TEXT NOT NULL,
created_at TEXT NOT NULL

-- clients (고객사/조직)
id TEXT PRIMARY KEY,
name TEXT NOT NULL,
description TEXT NOT NULL DEFAULT '',
created_by TEXT NOT NULL REFERENCES users(id),
created_at TEXT NOT NULL

-- client_members
client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
PRIMARY KEY (client_id, user_id)

-- projects
id TEXT PRIMARY KEY,
client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
name TEXT NOT NULL,
description TEXT NOT NULL DEFAULT '',
created_by TEXT NOT NULL REFERENCES users(id),
created_at TEXT NOT NULL

-- project_members
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
PRIMARY KEY (project_id, user_id)

-- tickets
id TEXT PRIMARY KEY,
project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
title TEXT NOT NULL,
description TEXT NOT NULL DEFAULT '',
type TEXT NOT NULL CHECK (type IN ('task', 'milestone')),
status TEXT NOT NULL,           -- backlog | todo | in_progress | done (칸반 컬럼)
priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
sort_order INTEGER NOT NULL DEFAULT 0,
milestone_id TEXT REFERENCES tickets(id) ON DELETE SET NULL,
assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
due_at TEXT,                    -- ISO date, 마감일
date_from TEXT,                 -- ISO date, 타임라인
date_to TEXT,
version INTEGER NOT NULL DEFAULT 1, -- 낙관적 락 버전
created_by TEXT NOT NULL REFERENCES users(id),
created_at TEXT NOT NULL,
updated_at TEXT NOT NULL

-- comments
id TEXT PRIMARY KEY,
entity_type TEXT NOT NULL CHECK (entity_type IN ('ticket')),
entity_id TEXT NOT NULL,
body TEXT NOT NULL,
author_id TEXT NOT NULL REFERENCES users(id),
created_at TEXT NOT NULL

-- files
id TEXT PRIMARY KEY,
entity_type TEXT NOT NULL CHECK (entity_type IN ('ticket')),
entity_id TEXT NOT NULL,
r2_key TEXT NOT NULL UNIQUE,
filename TEXT NOT NULL,
mime TEXT NOT NULL,
size INTEGER NOT NULL,
uploaded_by TEXT NOT NULL REFERENCES users(id),
created_at TEXT NOT NULL

-- pending_uploads (direct upload tokens)
id TEXT PRIMARY KEY,
ticket_id TEXT NOT NULL,
r2_key TEXT NOT NULL UNIQUE,
filename TEXT NOT NULL,
mime TEXT NOT NULL,
size INTEGER NOT NULL,
uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
expires_at TEXT NOT NULL,
created_at TEXT NOT NULL

-- ticket_activities (M8 변경 이력)
id TEXT PRIMARY KEY,
ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
actor_id TEXT NOT NULL REFERENCES users(id),
field TEXT NOT NULL,
old_val TEXT,
new_val TEXT,
at TEXT NOT NULL

-- agent_event_log (agent wake outbox; ≠ UI History)
id TEXT PRIMARY KEY,
at TEXT NOT NULL,
event_type TEXT NOT NULL,
ticket_id TEXT,
project_id TEXT,
actor_user_id TEXT NOT NULL REFERENCES users(id),
assignee_user_id TEXT,
payload_json TEXT NOT NULL DEFAULT '{}'
```

인덱스: `sessions(user_id)`, `client_members(user_id)`, `project_members(user_id)`, `projects(client_id)`, `tickets(project_id, status, sort_order)`, `tickets(project_id, type)`, `tickets(assignee_id)`, `tickets(due_at)`, `comments(entity_type, entity_id)`, `files(entity_type, entity_id)`, `pending_uploads(ticket_id)`, `pending_uploads(expires_at)`, `ticket_activities(ticket_id, at)`, `agent_event_log(at)`, `agent_event_log(id)`(tail).

정본 필드·REST: [agent/gateway/reference/event-log-schema.md](agent/gateway/reference/event-log-schema.md).

## 4. REST API

공통: JSON, 쿠키 세션. 미인증 → `401`. 비멤버 → `403`. 없음 → `404`. 충돌(낙관적 락) → `409`.

### Auth / Users

| Method | Path | Body / 결과 |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ email, password, name }` → `{ user }` + Set-Cookie. `is_admin`은 항상 false |
| POST | `/api/auth/login` | `{ email, password }` → `{ user }` + Set-Cookie |
| POST | `/api/auth/logout` | 세션 삭제 + Clear-Cookie |
| GET | `/api/auth/me` | `{ user }` (`id`, `email`, `name`, `created_at`, `is_admin`) |
| POST | `/api/auth/password` | `{ current_password, new_password }` → `{ ok: true }` (세션 필요; `new_password` ≥ 8자) |
| PATCH | `/api/users/me` | `{ name?, email? }` → `{ user }` (email 변경 시 UNIQUE 충돌 → 409). `is_admin` 변경 불가 |
| GET | `/api/admin/users` | 플랫폼 admin만. `{ users: [{ id, email, name, is_admin, created_at }] }` |
| PATCH | `/api/admin/users/:id` | `{ is_admin }` — 플랫폼 admin만. 마지막 admin 강등 → 400 `last_admin` |

### Clients

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/clients` | 내가 멤버인 목록 |
| POST | `/api/clients` | `{ name, description? }` — **플랫폼 admin만**; 생성자 = owner |
| GET | `/api/clients/:id` | 멤버만 |
| PATCH | `/api/clients/:id` | 멤버 |
| DELETE | `/api/clients/:id` | owner만 (소속 projects CASCADE) |
| GET | `/api/clients/:id/projects` | 해당 client 소속이면서 내가 project 멤버인 목록 |
| GET | `/api/clients/:id/members` | 소속 멤버 목록 (`owner`, `member`) |
| POST | `/api/clients/:id/members` | `{ user_id?, email?, role }` — owner만. `user_id` 또는 `email`(가입된 계정) 중 하나 |
| DELETE | `/api/clients/:id/members/:userId` | owner만 멤버 제거 (단, 마지막 owner 제거 불가) |

### Projects

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/projects` | 내가 멤버인 목록; query `client_id` 선택 |
| POST | `/api/projects` | `{ name, description?, client_id }` — client 멤버여야 함; 생성자 = project owner |
| GET | `/api/projects/:id` | 멤버만 (`client_id` 포함) |
| PATCH | `/api/projects/:id` | 멤버; `client_id` 변경 시 대상 client 멤버여야 함 |
| DELETE | `/api/projects/:id` | owner만 |
| GET | `/api/projects/:id/members` | 소속 프로젝트 멤버 목록 |
| POST | `/api/projects/:id/members` | `{ user_id?, email?, role }` — project owner만 추가 (client 멤버여야 함). `user_id` 또는 `email` |
| DELETE | `/api/projects/:id/members/:userId` | project owner만 멤버 제거 (마지막 owner 제거 불가) |

### Tickets (task + milestone)

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/projects/:id/tickets` | query: `type`, `status`, `assignee_id` (`me` = 현재 사용자), `limit`, `cursor` (Cursor 페이징) |
| POST | `/api/projects/:id/tickets` | `{ title, description?, type, status?, priority?, assignee_id?, due_at?, milestone_id?, date_from?, date_to? }` |
| GET | `/api/tickets/:id` | 멤버만 |
| PATCH | `/api/tickets/:id` | body에 `{ status, sort_order, priority, assignee_id, due_at, version? }` 포함. 버전 전달 시 불일치하면 `409 Conflict`; 성공 시 `version` 증가 및 변경 필드 `ticket_activities` 기록 |
| DELETE | `/api/tickets/:id` | **작성자(`created_by`) 또는 project owner만 삭제 가능** |
| GET | `/api/tickets/:id/activities` | 티켓 변경 이력 (최신순) |
| GET | `/api/projects/:id/kanban` | status별 tickets 그룹 (기본: 최근 완료건만 포함, query `include_archived=true`) |
| GET | `/api/projects/:id/timeline` | date_from/date_to 있는 항목 |

### Search

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/search` | query `q`(필수, trim 후 1자+), `limit`(기본 20, 최대 50). 내가 멤버인 client/project/ticket만. `clients`·`projects`는 `name LIKE %q%`, `tickets`는 `title LIKE %q%`. → `{ clients, projects, tickets }` |

### Comments / Files

| Method | Path | 비고 |
| --- | --- | --- |
| GET/POST | `/api/tickets/:id/comments` | |
| DELETE | `/api/comments/:id` | 작성자 또는 project owner |
| POST | `/api/tickets/:id/files` | `multipart/form-data` field `file` → R2 + meta (소용량) |
| POST | `/api/tickets/:id/files/upload-url` | `{ filename, mime, size }` → 임시 PUT `upload_url` + `r2_key` |
| PUT | `/api/files/direct-upload/:token` | 바이너리 본문 → R2 (토큰 인증, 세션 불필요) |
| POST | `/api/tickets/:id/files/confirm` | 업로드 완료 후 D1 메타 저장 |
| GET | `/api/files/:id` | Worker R2 스트림 프록시 |
| DELETE | `/api/files/:id` | 업로더 또는 owner; R2 객체도 삭제 |

### Agent outbox

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/agent/events` | query `after_id`, `limit`(기본 100, 최대 500). **세션 인증 필수**(gateway 전용 시스템 유저로 로그인). 응답 `{ events }` — 각 항목에 `payload`(JSON 객체). Worker→agent push 없음. |

티켓 create/update(필드 변경 시)/delete·코멘트 create 성공 시 Worker가 `agent_event_log`에 동기 append한다. tail은 `(at, id)` 키셋(`after_id`로 앵커). 라우팅·prompt는 gateway; 상세는 [agent/gateway/](agent/gateway/).

## 5. 첨부 업로드 흐름

1. **소용량 (기존):** `POST /api/tickets/:id/files` (multipart) → Worker가 R2 저장 및 D1 메타 INSERT.
2. **대용량 / Direct:**
   - 클라이언트가 `POST /api/tickets/:id/files/upload-url` 호출.
   - Worker가 권한 확인 후 `pending_uploads` 토큰과 PUT URL(` /api/files/direct-upload/:token`) 발급.
   - 클라이언트가 해당 URL로 바이너리 PUT → R2 binding 저장.
   - `POST /api/tickets/:id/files/confirm`으로 D1 `files` 메타 확정.
3. 다운로드는 `GET /api/files/:id`로 멤버십 검증 후 스트림 응답.

## 6. 칸반·타임라인 및 데이터 관리

- 칸반 컬럼 = `status` 고정 집합: `backlog`, `todo`, `in_progress`, `done`.
- 드래그 저장 = `PATCH /api/tickets/:id` with `{ status, sort_order, version }`.
- 완료 티켓 관리: `done` 중 `updated_at`이 14일 초과인 건은 기본 칸반에서 제외. `include_archived=true`로 포함.
- 타임라인 = `date_from`/`date_to`가 null이 아닌 ticket/milestone 목록.
- 만료 세션은 Cron(`0 * * * *`) `scheduled` 핸들러가 `sessions.expires_at < now` 행을 삭제한다.
