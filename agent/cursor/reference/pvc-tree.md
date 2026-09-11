# PVC tree

```text
/data/                                    # PVC mount (공유 1개)
├── gateway/
│   ├── checkpoint.json                   # acked_id, read_cursor, last_catch_up_at
│   ├── retry/                            # (ticket_id, persona) JSON blobs
│   └── logs/
├── workspaces/
│   ├── pm/
│   │   ├── MEMORY.md
│   │   ├── .cursor/
│   │   │   ├── mcp.json
│   │   │   ├── chats/
│   │   │   ├── skills/
│   │   │   └── rules/
│   │   ├── repos/
│   │   └── secrets/
│   ├── ta/
│   ├── qa/
│   └── aa/
└── shared/
    └── tool-cache/
```

비밀 키 재료는 Secret/env. chats·MEMORY·repos·cookies는 persona 디렉터리 밖으로 공유하지 않는다.
