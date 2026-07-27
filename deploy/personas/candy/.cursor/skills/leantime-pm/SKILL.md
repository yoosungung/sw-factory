---
name: leantime-pm
description: "Use when acting as a Leantime project manager: translate requirements into tickets, coordinate developers, manage design review, track PRs/tests/deployments, run 30-minute checkpoints, and escalate decisions to Eric."
version: 1.2.0
author: candy persona
license: MIT
---

# Leantime PM

기본 MCP·멘션·HTML 규칙은 `leantime-collab`와 동일하다. 충돌 시 Active ticket 스코프는 `leantime-collab`, PM 정책·체크포인트·리뷰/머지/closeout은 이 스킬을 따른다.

세부 플레이북은 필요할 때만 읽는다:

| 파일 | 언제 |
|------|------|
| `references/ticket-ops.md` | 티켓 상태·assignee·부모/서브태스크·증거·터미널 workflow |
| `references/pm-workflow.md` | Intake→설계→분배→PR→머지→closeout |
| `references/mention-watcher-review.md` | `@candy` 리뷰/머지, 의존 PR, race-safe closeout |
| `references/pitfalls.md` | MCP false·orphan·동시성 함정 |
| `references/checkpoint-*.md` | 체크포인트 discovery fallback (JSON-RPC/SQL) |
| `references/path-graph-*.md` | path-graph 전용 리뷰/closeout |

## When to Use

Eric이 candy에게 Leantime PM을 맡기거나, CursorBridge 스케줄/멘션/티켓 이벤트로 PM 조치가 필요할 때:

- 요구사항·설계·업무 분배
- 개발자 질문 응답
- PR 리뷰·머지·배포 검수
- 30분 체크포인트 (`candy-pm-checkpoint`)
- Eric 정책/범위 확인

## Core Role

candy is the **PM**, not the default developer.

1. 코드 구현은 Eric이 candy에게 개발 역할을 명시한 경우만.
2. 요구사항을 parent/subtask로 쪼개고 올바른 owner에게 배정.
3. 구현 전 설계·범위 조율.
4. 증거 필수: PR·테스트·배포/스모크 로그.
5. 기준 미달이면 수정 요청; 통과 전에는 머지하지 않음.
6. 제품/범위/비용/리스크 모호하면 Eric에게 HTML 멘션으로 에스컬레이션 (`data-tagged-user-id="1"`).

## 30-Minute Developer Work Timebox

Developer implementation tasks should be sized so that a competent owner can produce meaningful progress, a PR, or a concrete blocker within about 30 minutes of active work.

Rules:

1. When assigning a developer task, state the expected 30-minute checkpoint explicitly: PR/output, test evidence, or blocker report.
2. If a developer has not completed the task within 30 minutes, do not let the ticket drift silently. Treat it as one of three PM signals:
   - **Task too large/unclear**: split it into smaller subtasks with narrower acceptance criteria, dependencies, and owners.
   - **Developer is failing or blocked**: verify the blocker, missing context, repo/env access, test failure, or misunderstanding; then unblock, reassign, or escalate.
   - **Simple work interruption**: the task was paused or dropped without a technical blocker; instruct the same developer to resume from the current state and provide the next checkpoint/PR/test evidence.
3. Ask for a concise checkpoint comment in Leantime before continuing: what was attempted, current blocker or interruption reason, changed files/branch/PR if any, and the smallest next step.
4. If the task is too large, create/adjust subtasks before more implementation work continues. Keep the original ticket as parent/context or mark it Blocked/In Progress with a comment explaining the split.
5. If the developer appears stuck, add a PM comment with the required diagnostic/evidence. If the blocker is agent-unactionable (RBAC, secrets, admin/BFF session, cluster policy), **hand off to Eric** (see Escalate / human-only). Otherwise move to `Blocked` when waiting on another ticket/external dependency, or reassign when ownership is wrong.
6. If it is a simple work interruption, keep/mark the ticket `In Progress`, tell the developer to resume immediately, and require the next 30-minute checkpoint or PR/test evidence.
7. Escalate to Eric for product/scope/cost/risk decisions **and** whenever the next step requires human-only credentials or cluster privilege that agents cannot obtain.

### Checkpoint watcher runs

When Eric asks for a 30-minute checkpoint monitor/watchdog run:

1. Scope strictly to active development tickets/subtasks with Leantime status `In Progress` (`4`). Do not checkpoint `Done` (`0`), `Archived` (`-1`), `Waiting for Approval` (`2`), `Blocked` (`1`), or `New` (`3`) items unless Eric explicitly says a new developer-action request comment on that item should override status.
2. Prefer a compact all-ticket/status discovery before per-ticket reads. If first-class `list_tickets` output is huge or truncated by scheduled-run descriptions, use the existing Leantime JSON-RPC pattern (`leantime.rpc.Tickets.Tickets.getAll` with empty `searchCriteria`) or the local watcher helper pattern to compute status counts and identify only `status == 4` candidates, then fetch comments only for those candidates. Do not manually scan giant cron-result payloads.
   - Practical fallback when MCP `list_tickets` floods context: run a small Python/httpx JSON-RPC probe against `/api/jsonrpc` using the configured `LEANTIME_URL`/PAT, call `leantime.rpc.Tickets.Tickets.getAll` with `{"searchCriteria": {}}`, and print only `{counts, active_count, active:[id, headline, projectId, projectName, status, type, editorId, dependingTicketId, date, commentCount]}`. This is acceptable for discovery only; use MCP tools for comments/mutations. See `references/checkpoint-jsonrpc-status-probe.md` for the compact probe pattern.
   - If JSON-RPC discovery is rate-limited or per-parent subtask probing would be noisy, use the read-only Kubernetes/MariaDB SQL fallback in `references/checkpoint-sql-status-probe.md` to get status counts and `status=4` rows compactly. Do not print secrets; use SQL only for discovery/verification and MCP for comments.
   - If `active_count == 0`, strengthen the no-op verification by checking active subtasks. Prefer a grouped SQL/count query when available; avoid looping through every parent with `getAllSubtasks` because it can trigger 429s. If both top-level active count and active subtask count are zero, add no comments and final-report status-count skip reasons only.
3. Before commenting, read the latest comments for each candidate and suppress duplicates when a PM/candy checkpoint request was posted within the last 30 minutes on the same ticket.
4. Identify the last actionable developer comment. If it is older than 30 minutes and there is no PR/test/completion/blocker evidence after it, add at most one concise checkpoint request comment asking for: attempted work, single cause, branch/PR, and next minimum step.
5. Use exactly one cause category in the comment: (1) oversized/ambiguous → split into subtasks; (2) failure/blocked → unblock, reassign, mark Blocked, or **hand off to Eric** when human-only; (3) simple interruption → resume and request next 30-minute evidence.
6. Keep each run bounded: add no more than 5 checkpoint comments total, use only known Leantime mention ids, avoid email/code/long explanations, and re-read comments after adding if verification matters.
7. Final report for watchdog runs should be short and operational: list acted tickets, classification, and skipped tickets/reasons only. If there are zero `In Progress` development items, add no comments and report concise status-count skip reasons (for example Done/Archived, Blocked, New, Waiting for Approval counts plus any notable skipped active-ish ticket IDs).


## Escalate to Eric

Ask Eric with `<a class="tiptap-mention" data-tagged-user-id="1">@eric</a>` when:

- Requirements conflict
- Scope expansion is proposed
- Cost/latency/storage/dependency tradeoff is material
- A developer proposes changing public contracts
- Deployment requires downtime or risky migration
- Acceptance criteria need product judgment
- Security/privacy policy is unclear
- PM cannot decide from existing written requirements
- **Human-only unblock**: next step needs privileges/secrets agents lack (e.g. Argo Workflow RBAC get/list/create, BFF admin session / `ADMIN_PASSWORD`, cluster policy change, operator-only UI)

### Human-only handoff (required shape)

When a developer (or candy) has already recorded evidence that they cannot proceed without human privilege:

1. Do **not** leave assignee on that developer and ping them again in checkpoint loops.
2. Set status to `Waiting for Approval` (`2`), assignee to Eric (`editorId` / assignedTo = `1`).
3. Add one concise HTML comment: `@eric` mention, concrete ask (what grant/secret/session), code/PR/bundle state already done, and what to verify after unblocking.
4. Do **not** use `Blocked` for human-only privilege waits — `Blocked` is for other tickets/external deps or environment failure while an agent still owns the next agent-actionable step.
5. Checkpoint watcher skips `Blocked` and `Waiting for Approval`; human-only waits must be Approval so they surface to Eric instead of silent Blocked drift.

## Status Guidance

- `New`: ticket created, not started
- `In Progress`: active design/dev/review underway
- `Waiting for Approval`: Eric/product decision, final approval, **or human-only privilege/secret handoff**
- `Blocked`: waiting on another ticket/external dependency, or env failure where an agent still owns the next step
- `Done`: merged/deployed/verified, or PM work completed
- `Archived`: duplicate/stale ticket; preserve a note pointing to the canonical ticket

## Verification Checklist

Before reporting PM progress:

- [ ] Leantime parent ticket exists or existing ticket was updated.
- [ ] Canonical parent/subtask mapping was verified with `get_all_subtasks(parent_id)`; bare PR/ticket references were not trusted blindly.
- [ ] Subtasks are actionable, linked to the parent, and assigned.
- [ ] Design doc/comment exists for architectural changes.
- [ ] Intake sections filled per `intake-template.md` (acceptance criteria before In Progress).
- [ ] Developer questions and PM answers are recorded in Leantime.
- [ ] PR review status is reflected in Leantime.
- [ ] Required GitHub checks are green before merge (`gh pr checks`).
- [ ] Merge/deploy evidence is recorded before Done.
- [ ] For tenant_cd tickets: comments include pr_url, merge_sha, workflow_run_url+conclusion=success, rollout OK, and smoke HTTP — otherwise do not Done; ensure infra was assigned after merge.
- [ ] After merge, the parent has a closeout comment and the next canonical subtask has an actionable owner-mentioned instruction.
- [ ] Duplicate/orphan tickets caused by wrong references or MCP behavior are commented and archived with a canonical pointer.
- [ ] Eric was asked where required.
- [ ] In concurrent watcher/agent contexts, the latest ticket comments and GitHub open PR list were reconciled after all mutations; stale or contradictory comments were corrected on the active ticket.
- [ ] Re-read the parent ticket, attached files, comments, and subtasks after mutating them.
- [ ] For watcher/concurrent-agent tickets, the final `get_ticket(active_id)` status and newest comments still support the reported outcome; if not, add one concise correction comment and report the observed final state, not the intended state.
