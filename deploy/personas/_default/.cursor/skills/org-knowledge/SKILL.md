---
name: org-knowledge
description: >-
  전사 org-wiki를 웹보다 먼저 검색하고, 작업 후 inbox에 지식을 기여한다.
  wiki 검색, INDEX, org-wiki, inbox 기여, wiki-first, ORG_WIKI_URL 사용 시 적용한다.
---

# Org knowledge (wiki-first + inbox)

레이아웃·frontmatter: `references/wiki-layout.md`.  
참고: sw-factory **제품 UI**의 wiki/canvas는 Exclude다. 이 스킬은 **외부 org-wiki git**(`ORG_WIKI_URL`)용이다.

## Clone / path

- Env `ORG_WIKI_URL`(없으면 스킬 중단·티켓에 blocker).
- cwd가 이미 org-wiki면 그 경로를 쓴다.
- 그 외: ephemeral clone.

```bash
WIKI_ROOT="${ORG_WIKI_ROOT:-/tmp/org-wiki}"
URL="$ORG_WIKI_URL"
TOKEN="${GH_TOKEN_OVERRIDE:-$GH_TOKEN}"
if [ -n "$TOKEN" ]; then
  URL=$(printf '%s' "$ORG_WIKI_URL" | sed "s#https://#https://x-access-token:${TOKEN}@#")
fi
if [ -d "$WIKI_ROOT/.git" ]; then
  git -C "$WIKI_ROOT" fetch --depth=1 origin main && git -C "$WIKI_ROOT" reset --hard origin/main
else
  rm -rf "$WIKI_ROOT"
  git clone --depth=1 "$URL" "$WIKI_ROOT"
fi
```

## 읽기 (wiki-first)

조사·외부 사실 확인 **전**:

1. `$WIKI_ROOT/INDEX.md`를 읽는다.
2. 관련 경로를 `rg`로 검색한다 (`wiki/`; `inbox/`·`raw/`는 원료라 검색에서 제외해도 됨).
3. 히트 페이지를 읽고 **경로를 인용**한다.
4. **웹 검색은** wiki miss·`review_after` 경과·L0에 없는 외부 사실일 때만. 웹 결과는 즉시 확정하지 말고 inbox `sources`에 URL을 남긴다.

L0(`ARCHITECTURE`/`DESIGN`)·Active 티켓이 작업 범위 정본이다. wiki는 보조 컴파일 지식이다.

## 쓰기 (inbox만 — 비-km)

허용: `inbox/{AGENT_NAME}/YYYY-MM-DD-slug.md` 만. `AGENT_NAME`은 env `AGENT_NAME`(없으면 persona 이름).

금지: `INDEX.md`, `wiki/`(canonical), 타 agent `inbox/`.

```markdown
---
id: inbox-{agent}-{slug}
agent: {agent}
ticket_id: {id}
updated: YYYY-MM-DD
status: inbox
sources:
  - ticket:{id}
  - https://...
---

# 제목

- 사실/함정/명령/결정 (atomic)
- L0 계약 복제·시크릿·티켓 상태 로그 금지
```

```bash
cd "$WIKI_ROOT"
git checkout main
git pull --ff-only origin main
mkdir -p "inbox/${AGENT_NAME}"
# write file, then:
git add "inbox/${AGENT_NAME}/..."
git commit -m "inbox(${AGENT_NAME}): <slug>"
git push origin main   # PR·git-ship·feature branch·force 금지
```

충돌 시 `pull --rebase` 금지(force 위험). `pull --ff-only` 실패하면 티켓 blocker + `@km` / `@eric`.

## 작업 후 (필수)

Active 티켓 `add_comment`에 다음 중 하나:

- `wiki: inbox/{agent}/YYYY-MM-DD-slug.md`
- `wiki: N/A — <사유>` (재사용 가치 없음)

승격이 급하면 같은 코멘트에 `@km` — `factory-collab` 멘션 규칙(지금 할 일 있을 때만).
