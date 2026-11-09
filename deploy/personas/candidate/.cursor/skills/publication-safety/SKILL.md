---
name: publication-safety
description: >
  candidate.win 야간 publication gate.
  publication_gate.py --base origin/main → PASS/HOLD 증거를 티켓에 남김.
---

# publication-safety

`$ROOT` = `workspaces/candidate/repos/candidate.win`.

Wiki: `Publication-Gate-Empty-Overwrite-Guard` · schedule id `publication-safety`
(`0 18 * * *` UTC = **03:00 KST**, `schedule:publication-safety-0300-kst`).

## When

- 스케줄 `publication-safety`
- 티켓/멘션이 publication gate·야간 퍼블리시 안전 검사를 가리킬 때

## Steps

1. `cd $ROOT && git fetch origin main`
2. 로컬 `main`이 unpublished Pass 스택으로 `origin/main`과 diverge면 **detach to `origin/main`** 후 게이트만 돌린다(Pass 스택을 curation/gate에 ff merge 금지 — wiki §분기·스택).
3. 그 외: `git checkout main && git pull --ff-only`
4. `.venv` 있으면 활성화. `cd agent && python publication_gate.py --base origin/main`
5. **exit 0 (PASS):** zero-stance blocker 없음. unpublished diff가 비어 HEAD=`origin/main`이면 push·Hugo 스킵해도 **성공(Done)** — wiki clean-main 규칙.
6. **exit 2 (HOLD):** `PUBLICATION HOLD` + slug 목록을 Active/New에 남기고 **push 금지**.
7. empty-overwrite: 빈 공개 산출물로 기존 비어 있지 않은 파일을 덮어쓰지 않는다.
8. 성공 → Active에 PASS 증거 또는 Done 티켓. 실패/HOLD → New/Active blocker.

## Do not

- Leantime RPC / 승인 티켓 생성
- Pass 스택을 `origin/main`에 ff merge
- host launchd 복구(이 잡은 factory `agents.yaml` 스케줄만)
- `data/issues/*.yaml` · `<!-- human-edit -->` 임의 재작성
