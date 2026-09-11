# PVC layout

## 결정

| | |
|--|--|
| PVC | **1개** 공유 (`/data`) |
| 작업 상태 | **경로로 분리** |
| persona별 PVC N개 | 후순위 (quota 폭주 시) |

```text
/data/
  gateway/
    checkpoint.json
    retry/
    logs/
  workspaces/
    {name}/
      MEMORY.md
      .cursor/chats/     # 공유 금지
      .cursor/mcp.json
      repos/
      secrets/
  shared/
    tool-cache/          # 공유 허용 (비비밀)
```

## 공유 vs 분리

| 항목 | | 위치 |
|------|--|------|
| PVC 디바이스 | 공유 | `/data` |
| gateway checkpoint | gateway 전용 | `/data/gateway/` |
| MEMORY / chats / mcp | **분리** | `workspaces/{name}/` |
| git tree | **분리** | `workspaces/{name}/repos/` |
| 세션 쿠키 | **분리** | `workspaces/{name}/secrets/` 또는 Secret |
| `CURSOR_API_KEY` / `GH_TOKEN` | Secret env | PVC 금지 |
| tool-cache | 공유 허용 | `/data/shared/tool-cache` |

## 운영

- **Disk fill:** 한 persona가 PVC를 가득 채우면 전원 영향 → 용량 모니터 + persona별 `du` 가이드.
- **Retention:** `workspaces/*/ .cursor/chats` glob, 기본 14일 (GH PVC retention).
- **Backup:** `workspaces/{name}/` + `gateway/checkpoint.json` 단위 dump.
- **병렬:** 같은 persona cwd 동시 사용 금지; 타 persona는 디렉터리 달라 FS 충돌 없음.

트리 예시: [../reference/pvc-tree.md](../reference/pvc-tree.md).
