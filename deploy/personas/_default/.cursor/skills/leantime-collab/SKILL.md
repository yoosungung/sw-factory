---
name: leantime-collab
description: >-
  Leantime MCP로 티켓·코멘트·첨부파일을 읽고 업데이트한다. 티켓 작업, Leantime 협업,
  get_ticket, get_comments, add_comment, update_ticket, list_ticket_files,
  upload_ticket_file, download_ticket_file, delete_ticket_file 사용 시 적용한다.
---

# Leantime MCP 협업

Leantime MCP 서버(`leantime`) 도구를 사용한다. 작업 전 읽기, 작업 후 코멘트·상태 갱신이 필수다.

## 티켓 스코프 (필수)

이벤트 프롬프트에 `Active ticket_id=N`이 있으면 **N만** 작업 대상이다.

- 읽기: `get_ticket(N)`, `get_comments(module=ticket, module_id=N)`
- 쓰기: `add_comment`의 `module_id`와 `update_ticket`의 `ticket_id`는 **항상 N**
- 세션 대화에 다른 티켓(예: 이미 Done인 관련 이슈)이 나와도, 사용자가 다른 id를 명시하지 않는 한 그 티켓에 코멘트·상태 변경하지 않는다.

## 작업 전 (읽기)

1. `get_ticket`으로 **Active ticket_id** 상세를 확인한다.
2. `get_comments`(`module`: `ticket`, `module_id`: Active ticket_id)로 기존 코멘트·핸드오프 맥락을 읽는다.
3. `list_ticket_files`(`ticket_id`)로 첨부파일 목록을 확인하고, 필요하면 `download_ticket_file`(`enc_name`)로 내용을 읽는다. `enc_name`은 목록 응답의 `encName`(확장자 제외)을 쓴다.
4. 필요 시 `list_tickets`, `get_project`, `get_all_subtasks`로 범위를 좁힌다.

## 작업 중 (쓰기)

- 진행 상황·결정 사항은 `add_comment`를 우선한다.
- 티켓 본문·담당자·상태 변경은 꼭 필요할 때만 `update_ticket`을 쓴다.
- 산출물·스크린샷·로그 등은 `upload_ticket_file`(`ticket_id`, `file_path`)로 첨부한다. 로컬 파일 경로를 넘긴다.
- 잘못 올린 첨부는 `delete_ticket_file`(`file_id`)로 삭제한다. `file_id`는 `list_ticket_files`의 `id`다.

### 텍스트 줄바꿈 (MCP 쓰기)

Leantime 코멘트·티켓 본문은 Tiptap(HTML)으로 저장·표시된다. MCP로 보낼 때 **일반 `\n`만 넣으면 줄바꿈이 화면에 안 보일 수 있다.**

- `add_comment`의 `comment`: 여러 줄이면 `<br>` 또는 `<p>...</p>`를 쓴다. 예: `"1행<br>2행"`, `"<p>1행</p><p>2행</p>"`
- `update_ticket`의 `description`: HTML 형식(`<p>`, `<ul>`, `<br>` 등)으로 쓴다.
- 한 줄 요약 코멘트는 줄바꿈 없이 써도 된다.

### @멘션 (MCP 쓰기)

Leantime 멘션은 **HTML `data-tagged-user-id`** 로 저장해야 알림·봇 라우팅이 동작한다. `@이름`만 쓰면 일반 텍스트다.

```html
<a class="tiptap-mention" data-tagged-user-id="4">@candy</a> 리뷰 부탁드립니다.
```

리뷰 핸드오프의 기본 멘션·assignee는 **메인 리뷰어 candy**(user id `4`). 플랫폼/`GH_TOKEN` 등 인프라 blocker만 eric(`1`).

`MEMORY.md` 팀 표의 Leantime 이메일과 `bridge.json`의 `leantime_user_id`를 대응시킨다. 예: eric=1, candy=4, asky=5, path=6, runtime=7, finder=9, nl2sql=11, rhwp=12, infra=13, seewin=14.

## 작업 후 (필수)

1. **반드시** Active ticket_id에 `add_comment`로 요약·핸드오프 코멘트를 남긴다 (무엇을 했는지, 다음 담당자가 할 일).
2. 구현 완료 → Review → Done 순으로 상태를 올릴 때 `update_ticket`을 **같은 ticket_id**로 사용한다 (`get_status_labels`로 ID 확인).
3. 핸드오프 시 assignee 변경과 함께 **같은 티켓** 코멘트로 맥락을 전달한다.
4. 첨부가 있으면 코멘트에 파일명을 함께 적는다.

## 도구 요약

| 도구 | 용도 |
|------|------|
| `get_ticket` | 티켓 상세 |
| `get_comments` | 티켓/프로젝트 코멘트 |
| `add_comment` | 진행·요약·핸드오프 코멘트 |
| `update_ticket` | 상태·담당자·본문 변경 |
| `create_ticket` / `upsert_subtask` | 새 티켓·서브태스크 |
| `list_projects` / `list_tickets` | 탐색 |
| `list_ticket_files` | 티켓 첨부 목록 |
| `upload_ticket_file` | 로컬 파일 첨부 |
| `download_ticket_file` | 첨부 다운로드 (`content_base64`) |
| `delete_ticket_file` | 첨부 삭제 |

인증 오류 시 `mcp_auth` 후 재시도한다.
