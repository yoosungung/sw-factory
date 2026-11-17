# Sites guide (추천 · 정본 아님)

Tenant `.factory/marketing.yaml`의 `sites`가 우선이다. 아래는 비어 있을 때 채울 **예시 힌트**일 뿐, 스킬에 하드코딩하지 않는다.

## P0 — 공개 검색이 잘 되는 개발·제품 논의

| 예시 호스트 | 비고 |
|-------------|------|
| `news.ycombinator.com` | Show/Ask·키워드 스레드 |
| `www.reddit.com` | 공개 서브레딧만; 로그인/투표 금지 |
| `dev.to` | 공개 글·태그 검색 |
| `stackoverflow.com` / `*.stackexchange.com` | Q&A 스니펫 |

## P1 — 업계·커뮤니티 포럼

| 예시 호스트 | 비고 |
|-------------|------|
| `www.indiehackers.com` | 공개 포스트 |
| `discourse.*` / 제품 포럼 | robots·ToS 준수, 공개 페이지만 |
| `medium.com` | 공개 글 URL만 |

## P2 — 보조·주의

| 예시 호스트 | 비고 |
|-------------|------|
| `www.linkedin.com` | **공개 검색 스니펫만**. 로그인·스크rape·자동 댓글 **금지** |
| `x.com` / `twitter.com` | 공개 검색만; 봇 자동화 금지 |
| 사내/비공개 Slack·Discord | 대상 아님 |

검색은 sites×keywords 공개 웹만. 페이월·인증 벽은 skip.
