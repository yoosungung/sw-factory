---
name: candidate-escalation
description: >
  candidate.win Pass A escalation 큐 처리. agent/.cache/escalation/pending.jsonl
  의 저신뢰 stance를 재분석해 wiki agent:stances 에 반영하고 PR을 연다.
---

# candidate.win escalation drain

`$ROOT` = `workspaces/candidate/repos/candidate.win`.

## When

- 티켓/멘션이 candidate.win escalation·stance·Pass A 품질을 가리킬 때
- 스케줄/핸드오프 프롬프트가 escalation drain 을 요청할 때

## Steps

1. `cd $ROOT && git pull --ff-only`
2. `pending=agent/.cache/escalation/pending.jsonl` — 없으면 no-op 로 종료
3. 각 JSONL 행 (`person_slug`, `person_name`, `issue_slug`, `criteria`, `text`, `tier1_result`, `cache_key`)에 대해:
   - `data/issues/{issue_slug}.yaml` 의 `stances.support` / `stances.oppose` 기준으로 재분류
   - 근거 URL 없는 항목은 wiki에 쓰지 않음 (생략)
   - usable 이면 이슈·인물 wiki `<!-- agent:stances -->` 에 bullet 추가  
     (`append` 규칙: 이슈=`[/people/{slug}]`+`**입장**`, 인물=`[/issues/{slug}]`+`**입장**`)
4. 처리한 행은 `pending.jsonl`에서 제거하고 `processed.jsonl`에 append
5. `git-ship` 으로 PR (`feature/escalation-drain-YYYYMMDD`). `@pm` + 증거(처리 건수·이슈 slug)
6. merge는 **pm만**. Intent Pass 전 merge 금지

## Pass A 운영 (참고)

일일 crawl은 호스트 cron/`deep_agent.py --all` (Tier1 Ollama). IC는 파이프라인 코드·escalation·플래그 회귀를 소유한다. OpenAI Batch/DeepAgents 오케스트레이터는 없다.

## Do not

- `<!-- human-edit -->` 덮어쓰기
- `data/issues/*.yaml` 수정 (사람 SSoT)
- curated `data/people` 필드 임의 변경 (stub 생성만 허용 시 기존 규칙 준수)
