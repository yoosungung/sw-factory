# Workspaces (multi-persona)

한 컨테이너 안 persona마다 **cwd = `/data/workspaces/{name}`**.

## 레이아웃

```text
/data/workspaces/{name}/
  MEMORY.md
  .cursor/
    mcp.json
    skills/
    rules/
    chats/
  repos/                 # git checkouts (persona 전용)
  secrets/               # session cookie file 등 (또는 Secret mount)
```

시드: 이미지/ConfigMap의 `_default` + persona overlay (GH `render-agents` / persona bundle). `MEMORY.md`는 **seed-once**(파일 없을 때만).

## 규칙

- gateway·다른 persona 디렉터리를 읽거나 쓰지 않는다.
- SDK `local` runtime `cwd`는 해당 workspace.
- 동일 tenant repo가 필요하면 persona 아래 **복제 checkout** (공유 clone/하드링크 기본 금지) — [04-pvc-layout](04-pvc-layout.md).
