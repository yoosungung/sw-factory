---
name: tenant-repo-sync
description: >-
  Sync each clients[] product repo to a fresh ephemeral checkout before reading
  .factory/quality.yaml or running tenant commands. Use for weekly NF (QA/AA/TA)
  and ticket quality gates that read tenant criteria.
version: 1.0.0
author: factory default
license: MIT
---

# Tenant repo sync

계약: `ARCHITECTURE` §2.6 #10 · §2.8. Pod primary workspace(`WORKSPACE`) ≠ 전 고객사 제품 repo.
품질 기준·커맨드는 **테넌트 repo**의 `.factory/quality.yaml`에 있으므로, Discover/실행 **전에** 이 스킬로 최신화한다.

## Registry

Read `~/.cursor/clients-repos-registry.json` (시드: qa / aa / ta).

각 `clients[]` 항목: `leantime_client_id`, `project_id`, `repos[]` (`repo_id`, `git_repo_url`).

레지스트리 없음·비어 있으면 blocker를 남기고 중단(추측 clone 금지).

## Sync (client × repo)

For each registry client, for each `repos[]` entry:

```bash
REPO_ID="<repo_id>"
URL="<git_repo_url>"
ROOT="${TENANT_SYNC_ROOT:-/tmp/tenant-repos}/${REPO_ID}"
TOKEN="${GH_TOKEN_OVERRIDE:-$GH_TOKEN}"
if [ -n "$TOKEN" ]; then
  URL=$(printf '%s' "$URL" | sed "s#https://#https://x-access-token:${TOKEN}@#")
fi
mkdir -p "$(dirname "$ROOT")"
if [ -d "$ROOT/.git" ]; then
  git -C "$ROOT" fetch --depth=1 origin main \
    && git -C "$ROOT" reset --hard origin/main
else
  rm -rf "$ROOT"
  git clone --depth=1 "$URL" "$ROOT"
fi
SHA=$(git -C "$ROOT" rev-parse --short HEAD)
echo "synced: repo_id=${REPO_ID} sha=${SHA} path=${ROOT}"
```

- Default branch는 `main` (테넌트가 다르면 registry/티켓에 명시된 브랜치만 예외; 추측 금지).
- Dirty worktree를 고치지 말고 `reset --hard`로 ephemeral 트리를 맞춘다(이 경로는 제품 작업용이 아님).
- Primary `/workspace/repo`를 덮어쓰지 않는다.

## Evidence

주간 스케줄·게이트 리포트에 client마다 최소 한 줄:

`synced: repo_id=<id> sha=<short> path=<abs>`

skip 시: `synced: skip repo_id=<id> reason=…`

이후 작업은 **`$ROOT`** (동기화된 path)에서 `.factory/quality.yaml`을 읽고 tenant command를 실행한다.
