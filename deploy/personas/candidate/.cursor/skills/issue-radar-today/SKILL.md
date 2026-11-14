---
name: issue-radar-today
description: >
  candidate.win 일일 이슈 레이더 → /today/ 공개 큐 발행.
  issue_radar → publish_today → wiki/data/today.yaml 만 commit/push.
---

# issue-radar-today

`$ROOT` = `workspaces/candidate/repos/candidate.win`.

Wiki: `Publication-Gate-Empty-Overwrite-Guard` · schedule id `issue-radar-today`
(`0 23 * * *` UTC = **08:00 KST**).

## When

- 스케줄 `issue-radar-today`
- 티켓/멘션이 today 큐·issue-radar 복구를 가리킬 때

## Steps

1. `cd $ROOT && git checkout main && git pull --ff-only`
2. `.venv` 있으면 활성화. `cd agent && python issue_radar.py run`
3. `python publish_today.py` — exit ≠ 0 이면 중단(빈 큐로 기존 `today.yaml` 덮어쓰기 금지)
4. `git status`: 커밋 범위는 **`wiki/data/today.yaml`만**. cache JSON·리포트 MD 제외
5. items 비어 덮어쓰기가 스킵되면 no-op 증거만 남기고 종료(빈 커밋 금지)
6. 변경 있으면 commit → push(`main` 직푸시 허용: 공개 큐 단일 파일). SHA + `generated_at`을 티켓에 남김
7. 성공 → Active에 증거 또는 Done 티켓. 실패 → New/Active blocker.
   티켓 생성 시 create-once(`ticket.id` · POST≤1 · 동일 일자+title reuse). MCP 우선; REST는 `05-factory-mcp.md` fallback.

## Do not

- Leantime RPC / `--leantime` 실쓰기(`create_leantime_report` 호출 금지; 플래그는 경고 후 no-op)
- 승인 티켓 생성
- cache·report MD·`data/issues`·`<!-- human-edit -->` 커밋
