# Frontend — Admin / 관리 (Prod)

Jira Project/Space settings·People을 **멤버십 모델**(`owner`\|`member`)로 구현한다.  
전역 RBAC·플러그인·전역 settings·PAT는 Exclude — [backend §2](../../backend/DESIGN.md#2-도메인-범위).

관리 UI는 **빈 stub 금지**. owner가 아니면 읽기 전용 또는 메뉴 숨김.

---

## 1. 권한 매트릭스 (UI)

| 기능 | member | owner |
| --- | --- | --- |
| Space/Project 조회·이슈 CRUD* | ✓ | ✓ |
| Space/Project 이름·설명 수정 | ✓ (제품 정책: member 허용) | ✓ |
| People 초대·역할 변경·제거 | — | ✓ |
| Space/Project 삭제 | — | ✓ |
| Ownership 양도 | — | ✓ |
| Account 본인 프로필 | ✓ | ✓ |

\*이슈 삭제는 **작성자(`created_by`) 본인 또는 프로젝트 `owner`만** 가능 (ARCHITECTURE §1.7 계약).

---

## 2. Space settings — `/clients/:id/settings/*`

Jira Space/사이트 관리 축소.

### 2.1 Details — `.../details`

**Layout:** name, description, 저장.  
**API:** `GET/PATCH /api/clients/:id`.  
**Connections:** ← Space hub.

### 2.2 People — `.../people`

**Layout:** 멤버 테이블 (name, email, role), Add people, role 셀렉트 (`owner`\|`member`), Remove.  
**Behavior:** 이메일/사용자 검색 후 추가; 마지막 owner 제거 금지; 본인 owner 강등 시 경고.  
**API(ARCHITECTURE §4 / M6):**

| Method | Path |
| --- | --- |
| GET | `/api/clients/:id/members` |
| POST | `/api/clients/:id/members` `{ user_id, role }` |
| DELETE | `/api/clients/:id/members/:userId` |

owner만 멤버 추가/제거 가능. 마지막 owner는 제거할 수 없음.

### 2.3 Danger zone — `.../danger`

**Layout:** 삭제 확인(이름 재입력).  
**API:** `DELETE /api/clients/:id` (CASCADE projects). owner only.

---

## 3. Project settings — `/projects/:id/settings/*`

Jira Project settings (Details / People).

### 3.1 Details — `.../details`

**Layout:** name, description, parent Space(client) 표시·변경(대상 Space 멤버십 필요).  
**API:** `GET/PATCH /api/projects/:id`.

### 3.2 People — `.../people`

Space People와 동일 UX.  
**API(ARCHITECTURE §4 / M6):**

| Method | Path | 비고 |
| --- | --- | --- |
| GET | `/api/projects/:id/members` | 소속 멤버 목록 |
| POST | `/api/projects/:id/members` | `{ user_id, role }` (project owner만; 해당 client 멤버여야 함) |
| DELETE | `/api/projects/:id/members/:userId` | project owner만 (마지막 owner 보호) |

생성 시 creator=owner는 현 계약 유지. 초대 사용자는 해당 Space(Client) 멤버여야 함(ARCHITECTURE §1.4).

### 3.3 Board — `.../board`

**Layout:** 고정 컬럼 4개 설명(Backlog/To Do/In Progress/Done). 커스텀 컬럼 **없음**(Exclude).  
**Behavior:** 안내만; 저장 버튼 없음 또는 “Reset card open mode” 로컬 설정.

### 3.4 Danger zone — `.../danger`

**API:** `DELETE /api/projects/:id`. owner only.

---

## 4. Account — `/account`

Jira Profile에 대응.

| 섹션 | 필드 | API |
| --- | --- | --- |
| Profile | name, email | `GET /api/auth/me`, `PATCH /api/users/me` |
| Security | 비밀번호 변경 | `POST /api/auth/password` |
| Sessions | 현재 세션 로그아웃만(목록 Defer) | logout |

**넣지 않음:** 2FA, API tokens, 알림 설정, LDAP (Exclude).

---

## 5. Teams 디렉터리와의 관계

`/teams`([pages F12](pages.md))는 **조회·점프** 허브.  
실제 권한 변경은 항상 Space/Project **People** 설정에서 수행(프로젝트 단위 위임).

---

## 6. 관리 IA (사이드 내비)

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

## 7. Backend 승격 체크리스트 (관리 Prod)

ARCHITECTURE·[backend/DESIGN.md](../../backend/DESIGN.md) 승격 현황:

1. Client/Project **members CRUD** REST — **승격 완료** (ARCHITECTURE §4 / M6)
2. `assignee_id`, `due_at`, `priority`, `version` — **승격 완료** (ARCHITECTURE §3, §4 / M6)
3. 티켓 삭제 권한 가드 (작성자 or owner) — **승격 완료** (ARCHITECTURE §1.7 / M6)
4. `PATCH /api/users/me`, password change — **구현됨**
5. People 디렉터리 `GET /api/people` — 설계 검토
6. (선택) invite-by-email → user 없으면 초대 토큰 Defer; 1차는 **기존 user_id만**

Exclude: 플러그인 마켓, 시스템 settings 키-값, PAT 발급 UI.
