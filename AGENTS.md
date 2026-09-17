# [AGENTS.md](http://AGENTS.md)

This file provides guidance to AI coding assistants (Claude Code, Codex, Gemini, ...) when working with code in this repository. `CLAUDE.md`와 `GEMINI.md`는 이 파일로의 심볼릭 링크다 — 정본은 `AGENTS.md` 하나.

에이전트·기여자가 **무엇을 어디서 읽고 어떻게 실행하는지**만 담는다. 불변 규칙은 [ARCHITECTURE.md](ARCHITECTURE.md), 일정은 [ROADMAP.md](ROADMAP.md).

## 1. Documentation layout (문서 용도)

각 문서는 하나의 명확한 용도만 가진다. 같은 내용을 여러 문서에 중복하지 않는다. 한쪽을 고칠 때 다른 쪽이 같이 바뀌어야 한다면 잘못 나눈 것이므로 합치거나 한쪽이 다른 쪽을 참조하게 만든다.


| 파일                                                    | 용도                                                  | 위치                                                                 |
| ----------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| `AGENTS.md` (이 파일, 정본) ← `CLAUDE.md`, `GEMINI.md` 심볼릭 | 수행 방법 + 문서 레이아웃 + 현황                                | 루트                                                                 |
| `ARCHITECTURE.md`                                     | **계약사항(불변 규칙)** + 컴포넌트 *간* 인터페이스 형태(스키마·레이아웃·이벤트)   | 루트                                                                 |
| `README.md`                                           | 저장소 방문자용 소개 + 로컬 quickstart                         | 루트                                                                 |
| `ROADMAP.md`                                          | 수행 계획(마일스톤·순서·미결정 항목)                               | 루트                                                                 |
| `<comp>/DESIGN.md`                                    | 컴포넌트 *내부* 설계 + `## Commands` (빌드/실행/테스트)            | `backend/`, `frontend/`, `e2e/`, `agent/gateway/`, `agent/cursor/` |
| `frontend/ia/`                                        | SPA **Prod IA** (메뉴·페이지·관리·디자인 시스템)                 | `frontend/ia/`                                                     |
| `agent/shared/`                                       | agents.yaml 로드 등 gateway/cursor 공용                  | `agent/shared/`                                                    |
| `agent/gateway/`                                      | 티켓 이벤트 → agent prompt **배달** (CursorBridge 이식)      | `agent/gateway/`                                                   |
| `agent/cursor/`                                       | Cursor SDK runtime + MCP 작업 (agent-runner 이식)       | `agent/cursor/`                                                    |
| `deploy/`                                             | Workers 런북 + 공유 `env.example`/`agents.yaml.example` | `deploy/`                                                          |
| `deploy/docs/`                                        | v1 참고: agent 작업흐름·schedules 운영 문서                    | `deploy/docs/`                                                     |
| `deploy/docker/`                                      | agent Dockerfile·entrypoint·`build.sh`              | `deploy/docker/`                                                   |
| `deploy/local/`                                       | 로컬 Docker 실행·작업용 `.env`/`agents.yaml`               | `deploy/local/`                                                    |
| `deploy/k8s/`                                         | agent k8s 매니페스트·`apply.sh` (`NS=sw-factory`)        | `deploy/k8s/`                                                      |
| `deploy/personas/`                                    | persona MEMORY·skills·rules (`_default`+overlay)    | `deploy/personas/`                                                 |


규칙:

- **ARCHITECTURE.md §1 (계약) vs §2 이후 (형태).** §1은 "지켜야 하는 규칙(왜)" — 짧고 단정적. §2 이후는 "그 규칙을 구현하는 모양(어떻게)" — 스키마·필드·이벤트 목록. 규칙이 바뀌면 §1을 먼저 고치고 §2 이후를 따라 고친다. 두 부분을 다른 파일로 쪼개면 동기화 부담만 늘어 단일 문서로 둔다.
- **ARCHITECTURE.md vs** `<comp>/DESIGN.md`**.** ARCHITECTURE는 컴포넌트 *간*, 서브폴더 DESIGN은 해당 컴포넌트 *내부*. 두 쪽에 같은 내용을 적지 않는다.
- **README.md vs ARCHITECTURE.md / DESIGN.md.** README는 **인간 독자**(저장소 방문자·기여자)용이다. 계약·내부 설계는 README에 복사하지 않고 [ARCHITECTURE.md](ARCHITECTURE.md)·`<comp>/DESIGN.md`로 **링크만** 한다. 
- **배포 가능한 패키지·실행 하네스**에는 README를 둘 수 있다 — 해당 디렉터리 **로컬 사용법만**.
- 파일이 새로 생기거나 용도가 바뀌면 위 표를 즉시 갱신한다.
- 배포 런북은 `deploy/SETUP.md`, Workers 배포는 `.github/workflows/deploy.yml`. 빈 stub을 만들지 않는다.



## 2. 수행 방법 (How we work in this repo)

- 계획·설계·구현 변경은 해당 문서를 먼저(또는 함께) 고친다: 계획 변경 → `ROADMAP.md`, 계약·스키마 → `ARCHITECTURE.md`, 컴포넌트 내부 설계 → 해당 `DESIGN.md`, SPA 화면·메뉴 → `frontend/ia/`, 워크플로 → 이 파일.
- **v1 참고·반영:** `v1` 브랜치는 이전 Leantime 기반 공장의 **동작·운영·persona/skill 참고본**이다. 기능·워크플로·배포·에이전트 동작을 추가·고칠 때는 구현 전에 `v1`에서 동등·유사 구현을 확인한다. 현재 계약([ARCHITECTURE.md](ARCHITECTURE.md))과 스택(Workers/D1/R2, `agent/gateway`·`agent/cursor`)에 맞게 **가능한 범위만** 이식한다 — 의도·시퀀스·운영 패턴·persona를 우선하고, Leantime/PHP·구 경로 전용 코드는 그대로 복사하지 않는다. 반영한 것과 의도적 생략(갭)은 해당 `DESIGN.md` 또는 티켓에 한 줄로 남긴다.
- 코드가 처음 들어오는 컴포넌트는 그 폴더의 `DESIGN.md`를 함께 만들고, 이 파일의 §1 표 또는 `ARCHITECTURE.md` §1 계약사항을 필요 시 갱신한다.
- 컴포넌트에 첫 코드가 들어오면, 해당 폴더의 `DESIGN.md`에 `## Commands` 섹션을 추가해 빌드/실행/테스트 방법을 기록한다. 그 전까지는 비워둔다(존재하지 않는 명령을 만들어 적지 않는다).
- 개발은 TDD 방식으로 진행한다. (코드 스켈레톤 -> 테스트 코드 -> 기능 구현)
- **E2E:** UI·플로우를 건드리는 개발 중에는 `e2e/`에 시나리오를 **추가·갱신**한다. **마일스톤 종료(done 표시) 직전**에 `npm test`와 함께 `npm run test:e2e`를 실행해 green을 확인한다. 명령·스펙 목록: [e2e/DESIGN.md](e2e/DESIGN.md).
- 한국어/영어 혼용을 허용한다. 한 문서 내 일관성만 지킨다(현재 AGENTS/ARCHITECTURE/ROADMAP/DESIGN은 한국어 본문 + 영어 식별자).



## 3. Status

M0–M10 · FE0–FE8 완료. Agent: A0–A7 완료 (A8 schedules planned). UX: UX0–UX5 완료 ([frontend/ia/menus.md](frontend/ia/menus.md)).  
로컬: npm install && npm run db:migrate:local && npm run dev. 테스트: npm test · E2E: npm run test:e2e ([e2e/DESIGN.md](e2e/DESIGN.md)).  
디버그: [.vscode/launch.json](.vscode/launch.json) — Run and Debug → **Debug All**.  
Agent: [agent/gateway/](agent/gateway/) · [agent/cursor/](agent/cursor/) · `npm run agent:cursor` / `agent:gateway`.  
Agent Docker: [deploy/docker/](deploy/docker/) · 로컬: [deploy/local/](deploy/local/) · k8s: [deploy/k8s/](deploy/k8s/).