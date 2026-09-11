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

시드 정본: [deploy/personas/](../../../deploy/personas/) — `_default/` + `{persona}/` overlay.  
머지·적용: [persona-bundle](../src/persona-bundle.ts) (`buildPersonaBundle` · `applyPersonaBundle`).  
`MEMORY.md`는 **seed-once**(파일 없을 때만). skills/rules는 재시드 시 overwrite.  
세션 쿠키·`mcp.json`은 [factory-mcp seed](../mcp/seed.ts)가 생성(번들 mcp.json은 사용하지 않음).

## 규칙

- gateway·다른 persona 디렉터리를 읽거나 쓰지 않는다.
- SDK `local` runtime `cwd`는 해당 workspace.
- 동일 tenant repo가 필요하면 persona 아래 **복제 checkout** (공유 clone/하드링크 기본 금지) — [04-pvc-layout](04-pvc-layout.md).
