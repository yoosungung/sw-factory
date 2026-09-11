---
name: git-ship
description: >-
  봇이 리뷰 핸드오프 전에 commit·push·PR을 수행한다.
  Review 핸드오프, PR 생성, git push, gh pr create 시 적용한다.
---

# Git ship (리뷰 전 배송)

봇에는 **사람이 없다**. 리뷰어가 diff를 보려면 원격 커밋과 PR이 있어야 한다. **push·PR은 에이전트가 수행**한다. 사람에게 로컬 push를 요청하지 않는다.

## Definition of Ready for Review

1. 테스트·문서(TDD) 반영 완료
2. Active 티켓 `add_comment`에 테스트 증거 또는 `test: N/A — <사유>`
3. `git status` clean 또는 의도된 변경만 스테이징
4. `git commit` (의미 있는 메시지)
5. `git push` — **`git push --force` / `git reset --hard` 금지**
6. PR 열림 — `gh pr create` 또는 기존 PR 갱신
7. factory: 리뷰 의도 + assignee → **pm**, 코멘트에 PR URL·`@pm`

## 절차

```bash
cd <persona-repos-checkout>
git status
git checkout -b feature/<ticket>-<slug>
git add <files>
git commit -m "..."
git push -u origin HEAD
gh pr create --title "..." --body "..."
```

실패 시 Active 티켓에 blocker 코멘트 + `@eric` 후 중단.
