# leantime-mcp (fork)

[daniel-eder/leantime-mcp](https://github.com/daniel-eder/leantime-mcp) 포크. Leantime JSON-RPC를 Cursor MCP 도구로 노출한다.

## 인증 (0.3.0)

agent별 **Personal Access Token**만 사용한다 (Leantime 3.9+ Bearer).

| 변수 | 필수 | 설명 |
|------|------|------|
| `LEANTIME_URL` | ✅ | Leantime 베이스 URL |
| `LEANTIME_ACCESS_TOKEN` | ✅ | 해당 agent Leantime 계정 PAT (`Authorization: Bearer`) |
| `LEANTIME_SSL_VERIFY` | | 기본 `true`. k8s-test 등 자체 서명 인증서면 `false` |

발급: Leantime **Profile → Personal Access Tokens**. 형식은 `lt_`가 아닌 랜덤 문자열(예: `vOa...`).

## 로컬 Cursor MCP

1. `cp .env.example .env` 후 PAT·URL 입력 (`path.cursor@askwho.net` 등 agent 계정 PAT).
2. `python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`.
3. 저장소 루트 `.cursor/mcp.json`이 로컬 venv `leantime-mcp`와 `leantime-mcp/.env`를 가리킨다.
4. Cursor 재시작 → MCP **leantime** 연결 확인.

upstream `daniel-eder/leantime-mcp`(uvx git)는 `LEANTIME_API_KEY`·`LEANTIME_USER_EMAIL` 방식이라 이 포크와 호환되지 않는다.

## Commands

```bash
cd leantime-mcp
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

## `update_ticket` (partial)

Leantime JSON-RPC `Tickets.updateTicket`은 미전달 필드를 `''`로 덮어쓴다(본문·담당자 소실). MCP `update_ticket`은 **`Tickets.patchTicket`** 으로 넘긴 필드만 갱신한다. 도구 인자 `assignedTo`는 Leantime 컬럼 `editorId`로 매핑한다. `project_id`는 도구 시그니처 호환용이며 patch에 보내지 않는다.

## MCP tools (tickets list filter)

| tool | 인자 | 동작 |
|------|------|------|
| `list_tickets` | `project_id?`, `updated_since?` | JSON-RPC `Tickets.Tickets.getAll` 후, `updated_since`(ISO)가 있으면 응답의 **`modified`**(없으면 `date`) ≥ cutoff만 남김 |

서버측 `modifiedAfter`는 없다. `searchCriteria.dateFrom`/`dateTo`는 **생성일(`date`)** 기준이라 last-updated와 다르다.

## MCP tools (comments)

| tool | API |
|------|-----|
| `add_comment` | JSON-RPC `Comments.Comments.addComment` |
| `edit_comment` | JSON-RPC `Comments.Comments.editComment` (`id` + `values.text`) |
| `delete_comment` | JSON-RPC `Comments.Comments.deleteComment` (`commentId`) |
| `get_comments` | JSON-RPC `Comments.Comments.getComments` (+ 클라이언트 필터) |

`get_comments` 추가 인자:

| 인자 | 의미 |
|------|------|
| `since` | 코멘트 **`date`**(생성) ≥ cutoff. 코멘트에는 신뢰할 `modified`가 없다 |
| `mentioned_user_id` | HTML `data-tagged-user-id="N"` 멘션만 (plain `@name` 제외) |

나를 멘션한 코멘트 찾기: 후보 티켓을 `list_tickets(updated_since=...)`로 좁힌 뒤, 각 티켓에 `get_comments(module=ticket, mentioned_user_id=<내 user id>, since=...)`. 전역 mention inbox API는 아직 MCP에 노출하지 않는다.

`edit_comment` / `delete_comment`는 작성자이거나 `comments.moderate` 권한이 있을 때만 성공한다. `comment_id`는 `get_comments` 응답의 `id`를 사용한다.

## MCP tools (files)

티켓 첨부파일 — Leantime `Files` 도메인 + HTTP multipart.

| tool | API |
|------|-----|
| `list_ticket_files` | JSON-RPC `Files.Files.getFilesByModule` (`module=ticket`) |
| `upload_ticket_file` | `POST /files/upload?module=ticket&moduleId={id}` (multipart `file`) |
| `download_ticket_file` | `GET /files/get?encName={encName}` → `content_base64` |
| `delete_ticket_file` | JSON-RPC `Files.Files.deleteFile` |

`download_ticket_file`의 `enc_name`은 `list_ticket_files` 응답의 `encName`(확장자 제외)을 사용한다.

agent-runner 이미지 빌드 시 저장소 루트에서:

```bash
docker build -f agent-runner/Dockerfile .
```
