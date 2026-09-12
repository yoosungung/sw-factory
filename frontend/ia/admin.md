# Frontend — Admin / 관리 (Prod)

Space/Project settings·People을 **멤버십 모델**(`owner`\|`member`)로 구현한다.  
플랫폼 권한은 `users.is_admin` **한 비트**만 — 계정별 CRUD 매트릭스·플러그인·전역 settings·PAT는 Exclude.

관리 UI는 **빈 stub 금지**. owner가 아니면 읽기 전용 또는 메뉴 숨김. Create space·`/admin`은 `is_admin`만.

---

## 1. 권한 매트릭스 (UI)

| 기능 | 가입만 | member | owner | 플랫폼 admin |
| --- | --- | --- | --- | --- |
| Space/Project 조회·이슈 CRUD* | — | ✓ (초대된 범위) | ✓ | ✓ (멤버인 범위) |
| Space 생성 | — | — | — | ✓ |
| Space/Project 이름·설명 수정 | — | ✓ | ✓ | ✓ |
| People 초대·역할 변경·제거 | — | — | ✓ | ✓ (owner인 Space) |
| Space/Project 삭제 | — | — | ✓ | ✓ (owner인 Space) |
| `/admin` 계정 목록·is_admin | — | — | — | ✓ |
| Account 본인 프로필 | ✓ | ✓ | ✓ | ✓ |

\*이슈 삭제는 **작성자(`created_by`) 본인 또는 프로젝트 `owner`만** 가능 (ARCHITECTURE §1.7 계약).

---

## 2. Platform admin — `/admin`

**Layout:** Top nav(사이드바 없음). Users 테이블 (name, email, is_admin, created_at) + is_admin 토글. Create space.  
**Behavior:** 비admin → `/`. 마지막 admin 강등 시 에러 표시. Create space → `POST /api/clients` 후 hub.  
**API:** `GET /api/admin/users`, `PATCH /api/admin/users/:id` `{ is_admin }`, `POST /api/clients`.  
**Connections:** Avatar ▾ **Admin**.

시드 계정: `.dev.vars` `ADMIN_EMAIL` / `ADMIN_PASSWORD` (로컬 기본 `admin@localhost`).

---

## 3. Space settings — `/clients/:id/settings/*`

Space/사이트 관리 축소.

### 3.1 Details — `.../details`

**Layout:** name, description, 저장.  
**API:** `GET/PATCH /api/clients/:id`.  
**Connections:** ← Space hub.

### 3.2 People — `.../people`

**Layout:** 멤버 테이블 (name, email, role), Add people(검색→선택), role 셀렉트 (`owner`\|`member`), Remove.  
**Behavior:** name/email **검색 타입어헤드**로 가입 계정을 골라 `user_id`로 추가(미가입·미매칭은 결과 없음); 마지막 owner 제거 금지; 본인 owner 강등 시 경고.  
**API(ARCHITECTURE §4 / M6·M9):**

| Method | Path |
| --- | --- |
| GET | `/api/users/search?q=` | 후보 검색 (`q` ≥ 2) |
| GET | `/api/clients/:id/members` |
| POST | `/api/clients/:id/members` `{ user_id?, email?, role }` |
| DELETE | `/api/clients/:id/members/:userId` |

owner만 멤버 추가/제거 가능. 마지막 owner는 제거할 수 없음. 대상은 이미 가입된 `users` 행이어야 한다.

### 3.3 Danger zone — `.../danger`

**Layout:** 삭제 확인(이름 재입력).  
**API:** `DELETE /api/clients/:id` (CASCADE projects). owner only.

---

## 4. Project settings — `/projects/:id/settings/*`

Project settings (Details / People).

### 4.1 Details — `.../details`

**Layout:** name, description, parent Space(client) 표시·변경(대상 Space 멤버십 필요).  
**API:** `GET/PATCH /api/projects/:id`.

### 4.2 People — `.../people`

Space People와 동일 UX. 초대는 해당 Space 멤버만(이메일/`user_id`).  
**API(ARCHITECTURE §4 / M6·M9):**

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/projects/:id/members` | 소속 멤버 목록 |
| POST | `/api/projects/:id/members` | `{ user_id?, email?, role }` (project owner만; 해당 client 멤버여야 함) |
| DELETE | `/api/projects/:id/members/:userId` | project owner만 (마지막 owner 보호) |

생성 시 creator=owner는 현 계약 유지. 초대 사용자는 해당 Space(Client) 멤버여야 함(ARCHITECTURE §1.4).

### 4.3 Board — `.../board`

**Layout:** 프로젝트 status 목록 편집(label · category · 순서). 기본 9컬럼(Backlog→…→Done + Blocked/Waiting).  
**Behavior:** owner만 추가·이름변경·순서변경·삭제 후 Save → `PUT /api/projects/:id/statuses` (`migrate`로 티켓 재매핑). 멤버는 읽기 전용.

### 4.4 Danger zone — `.../danger`

**API:** `DELETE /api/projects/:id`. owner only.

---

## 5. Account — `/account`

계정 프로필.

| 섹션 | 필드 | API |
| --- | --- | --- |
| Profile | name, email | `GET /api/auth/me`, `PATCH /api/users/me` |
| Security | 비밀번호 변경 | `POST /api/auth/password` |
| Sessions | 현재 세션 로그아웃만(목록 Defer) | logout |

**넣지 않음:** 2FA, API tokens, 알림 설정, LDAP, 본인 `is_admin` 변경 (Exclude).

---

## 6. Teams 디렉터리와의 관계

`/teams`([pages F12](pages.md))는 **조회·점프** 허브(Top nav 없음). Space settings **People**이 진입점.  
실제 권한 변경은 항상 Space/Project **People** 설정에서 수행(프로젝트 단위 위임). 플랫폼 계정 목록은 `/admin`.

---

## 7. 관리 IA (사이드 내비)

Space settings:

```
Details
People
───
Danger zone
```

Project settings:

```
Details
People
Board
───
Danger zone
```

---

## 8. Backend 승격 체크리스트 (관리 Prod)

ARCHITECTURE·[backend/DESIGN.md](../../backend/DESIGN.md) 승격 현황:

1. Client/Project **members CRUD** REST — **승격 완료** (ARCHITECTURE §4 / M6)
2. `assignee_id`, `due_at`, `priority`, `version` — **승격 완료** (ARCHITECTURE §3, §4 / M6)
3. 티켓 삭제 권한 가드 (작성자 or owner) — **승격 완료** (ARCHITECTURE §1.7 / M6)
4. `PATCH /api/users/me`, password change — **구현됨**
5. 플랫폼 `is_admin` · Space 생성 가드 · `/api/admin/users` — **구현됨** (M9)
6. People 초대 `email`/`user_id` + `GET /api/users/search` 타입어헤드 — **구현됨**
7. People 디렉터리 `GET /api/people` — 설계 검토

Exclude: 플러그인 마켓, 시스템 settings 키-값, PAT 발급 UI, 계정별 CRUD 매트릭스.
