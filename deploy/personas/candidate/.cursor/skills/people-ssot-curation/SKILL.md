---
name: people-ssot-curation
description: >
  candidate.win people SSoT 일일 curation (18:00 KST).
  stub→curated 승격(allowlist URL) · slug hygiene · empty-diff no-op.
---

# people-ssot-curation

`$ROOT` = `workspaces/candidate/repos/candidate.win`.

Wiki: `Publication-Gate-Empty-Overwrite-Guard` · schedule id `people-ssot-curation`
(`0 9 * * *` UTC = **18:00 KST**, `schedule:people-ssot-curation-18h-kst`).

## When

- 스케줄 `people-ssot-curation`
- 티켓/멘션이 people SSoT·18h curation 복구를 가리킬 때

## Steps

1. `cd $ROOT && git fetch origin main`
2. 로컬 `main`이 unpublished Pass 스택으로 `origin/main`과 diverge면 **preserve 브랜치 백업 후 `origin/main` detach** (Pass 스택을 curation에 ff merge 금지). 그 외: `git checkout main && git pull --ff-only`
3. `.venv` 있으면 활성화. stub 백로그를 읽고 **allowlisted 공식/프로필 URL(≥1)** 로 신원·역할이 확인된 stub만 `status: curated` 승격. yaml↔wiki 동시 갱신(orphan 0).
4. Hygiene: slug alias remap, non-person/org 링크 delink, weak/wrong-role hold. `data/issues/*.yaml` · `<!-- human-edit -->` · curated 사람-큐레이팅 필드 임의 재작성 금지.
5. 안전 출처 없으면 **강제 승격 금지**. 잔여 stub 수·hold 사유를 티켓에 남기고 Done(부족 ≠ 실패).
6. `git status`: 콘텐츠 diff 0 → commit/push 없음(빈 커밋 금지, clean no-op Done). 변경 있으면 commit → `push HEAD:main`(detach 경로) 또는 main push → 로컬 Pass 스택 checkout/rebase.
7. 성공 → Active에 승격 목록+SHA 또는 no-op 증거. 실패 → New/Active blocker.

## Do not

- Leantime RPC / 승인 티켓 생성
- Pass 스택을 `origin/main`에 ff merge
- host launchd 복구(이 잡은 factory `agents.yaml` 스케줄만)
- `data/issues/*.yaml` · `<!-- human-edit -->` 임의 재작성
- 동명이인·역할 불일치·검색 URL·bare 호스트만으로 승격
