# K8s 배포 (namespace: leantime)

## 사전 요구

- Leantime이 `leantime` namespace에 배포됨
- `CURSOR_API_KEY` · agent별 `LEANTIME_ACCESS_TOKEN_{name}` Secret (`cursor-api-key`)
- agent-runner 이미지 (`cursor-agent-runner:latest`)

## 1. agents 정의

로컬 정본은 `deploy/k8s/agents.yaml`(gitignore). 최초:

```bash
./scripts/bootstrap-config.sh   # *.sample → agents.yaml / bridge.json / MEMORY.md
# 실계정·repo URL로 agents.yaml·MEMORY.md 수정 후
python deploy/k8s/scripts/sync-bridge-json.py
```

커밋되는 템플릿은 `agents.yaml.sample` / `bridge.json.sample` / `MEMORY.md.sample`이다. 계정 ≤10명. `type`:

| type | Pod | runner_url |
|------|-----|------------|
| `human` | 없음 | 빈 문자열 |
| `sessions` | `cursor-agent-{name}` StatefulSet/Service | sync가 DNS 생성; `model`(선택) → `AGENT_RUNNER_MODEL` |
| `openai` | 없음 | YAML 필수 (예: `http://openai-runner.example.svc:8642`) |

`sessions` 생략 시 `settings.model`(기본 `composer-2.5`). **남은** `type: openai` agent가 있을 때만 Leantime Pod env **`CURSORBRIDGE_OPENAI_API_KEY`**(외부 OpenAI-compatible `API_SERVER_KEY`, 예: Hermes) Bearer가 필요하다. candy는 `sessions`(`cursor-agent-candy`)다.

## 2. 렌더 및 bridge 동기화

```bash
pip install pyyaml   # 또는 venv
./deploy/k8s/scripts/render-agents.sh
python deploy/k8s/scripts/sync-bridge-json.py
```

`render-agents.sh`는 `deploy/k8s/base/generated/`에 StatefulSet·Service·ConfigMap·kustomization을 생성합니다. Persona ConfigMap은 `deploy/personas/_default/`와 `deploy/personas/{persona}/`를 병합합니다 (`persona_bundle.py`). Cursor rules는 `.cursor/rules/*.mdc`로 시드됩니다.

## 3. Secret

`cursor-api-key` — **전 runner 공유**.

| 키 | 용도 |
|----|------|
| `CURSOR_API_KEY` | `@cursor/sdk` |
| `LEANTIME_ACCESS_TOKEN_{name}` | agent별 Leantime PAT (`path` → `LEANTIME_ACCESS_TOKEN_path`). Profile → Personal Access Tokens에서 발급 |
| `GH_TOKEN` | **봇 runner 필수(공유 기본값)** — GitHub PAT (`repo` 또는 대상 repo write). Pod 시작 시 `gh auth setup-git`·`git push`·`gh pr create`용. GHCR pull은 `ghcr-pull` Secret 별도 |
| `GH_TOKEN_{name}` | **선택** — agent별 GitHub PAT override (`candy` → `GH_TOKEN_candy`). 있으면 해당 Pod만 공유 `GH_TOKEN` 대신 사용 |
| `CURSORBRIDGE_OPENAI_API_KEY` | `type: openai` runner용 Bearer(외부 OpenAI-compatible). **남은 openai agent가 있을 때만** Leantime Deployment env로 주입 |

`openai` runner용 키 등록 예:

```bash
kubectl -n leantime patch secret cursor-api-key --type merge \
  -p '{"stringData":{"CURSORBRIDGE_OPENAI_API_KEY":"<HERMES_API_SERVER_KEY>"}}'
# Leantime Deployment에 secretKeyRef env CURSORBRIDGE_OPENAI_API_KEY 연결 후
kubectl -n leantime rollout restart deployment/leantime
```

PAT 등록 예:

```bash
kubectl -n leantime patch secret cursor-api-key --type merge \
  -p '{"stringData":{"LEANTIME_ACCESS_TOKEN_path":"<PAT>"}}'
kubectl -n leantime rollout restart statefulset/cursor-agent-path
```

agent별 GitHub 토큰 예 (candy = Hermes/`berryking404` PAT):

```bash
kubectl -n leantime patch secret cursor-api-key --type merge \
  -p '{"stringData":{"GH_TOKEN_candy":"<PAT>"}}'
kubectl -n leantime rollout restart statefulset/cursor-agent-candy
```

agent identity는 `agents.yaml` `email` / `bridge.json`이 담당. Leantime MCP 인증은 Pod `LEANTIME_ACCESS_TOKEN` → persona `mcp.json`만 사용.

### GH_TOKEN 발급 (GitHub PAT)

봇이 리뷰 전에 `git push`·PR을 열려면 **repo write** 권한이 있는 PAT가 필요하다.

**Fine-grained PAT (권장)**

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. **Resource owner**: 토큰 소유 org/user (예: `yoosungung`)
3. **Repository access**: bot이 담당하는 repo 전부 선택 (또는 *All repositories* — 운영 정책에 맞게)
4. **Permissions** → **Contents**: Read and write · **Pull requests**: Read and write · **Metadata**: Read-only (기본)
5. 만료일 설정 후 생성 → **토큰 문자열을 한 번만** 복사

**Classic PAT (대안)**

1. **Personal access tokens** → **Tokens (classic)** → **Generate new token**
2. scope: `repo` (private repo push/PR에 필요)

**클러스터에 등록**

```bash
kubectl -n leantime patch secret cursor-api-key --type merge \
  -p '{"stringData":{"GH_TOKEN":"ghp_xxxxxxxx"}}'
kubectl -n leantime rollout restart statefulset -l app=cursor-agent
```

**Pod에서 확인**

```bash
kubectl -n leantime exec cursor-agent-runtime-0 -c agent-runner -- gh auth status
# "Logged in to github.com account ... (GH_TOKEN)" — 정상
```

`GH_TOKEN` 없이 봇 Pod는 시작하지 않는다 (`entrypoint.sh`).

agent-runner 이미지에 **Python 3.12 + uv**, **kubectl**(in-cluster), **gh**, **git** 포함. Pod는 `cursor-agent` ServiceAccount + ClusterRole `cursor-agent-observer`로 클러스터 모니터링·제한적 kubectl 작업(infra 포함). `path-graph` Role `cursor-agent-argo-workflows`로 Argo `workflows` get/list/create/delete/patch. RBAC 객체 write·Secret 전역 list는 기본 미부여.

## 4. 이미지 빌드·푸시

```bash
docker buildx build --platform linux/amd64 \
  -f agent-runner/Dockerfile \
  -t ghcr.io/yoosungung/cursor-agent-runner:latest --push .
```

`agents.yaml` `settings.runner_image`에 태그 지정. private GHCR:

```bash
kubectl -n leantime create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io --docker-username=USER \
  --docker-password="$(gh auth token)"
```

StatefulSet에 `imagePullSecrets: ghcr-pull` 포함됨.

## 5. 배포

```bash
kubectl apply -k deploy/k8s/base
kubectl -n leantime rollout status statefulset/cursor-agent-asky
kubectl -n leantime get pods -l app=cursor-agent
```

## 6. Leantime 플러그인

```bash
./scripts/install-plugin-k8s.sh   # ConfigMap 갱신 + Leantime 재시작 + initContainer 설치
```

UI: My Apps에서 CursorBridge 설치·활성화(이미 DB에 있으면 활성만 확인).

스크립트는 ConfigMap 적용 후 `deploy/leantime`을 rolling restart한다. 플러그인 파일은 새 Pod의 initContainer가 `emptyDir`에 복사하므로, 재시작 없이 ConfigMap만 갱신하면 실행 중인 Pod에는 새 코드가 반영되지 않는다.

### Retry queue flush (CronJob)

`kubectl apply -k deploy/k8s/base`에 `cursorbridge-flush-retries` CronJob이 포함된다. **5분마다** Leantime Pod에 `exec`해 `flushRetries()`를 실행한다 (SQLite·`bridge.json`은 Leantime Pod `emptyDir`에만 있음). 이미지는 클러스터에 이미 있는 `ghcr.io/yoosungung/cursor-agent-runner:latest` + `ghcr-pull` Secret을 사용한다.

```bash
kubectl -n leantime get cronjob cursorbridge-flush-retries
kubectl -n leantime logs -l component=flush-retries --tail=20
```

수동 flush:

```bash
kubectl -n leantime exec deploy/leantime -- \
  php /var/www/html/app/Plugins/CursorBridge/bin/flush-retries.php
# 또는 로컬
./scripts/flush-retries.sh
```

### schedules 틱 (CronJob)

`cursorbridge-schedule-tick`이 **매분(UTC)** `tick-schedules.php`를 실행한다. 정본은 `deploy/k8s/agents.yaml` `settings.schedules` → `sync-bridge-json.py` → `bridge.json`. due인 항목은 선택 `gates`를 통과한 뒤 대상 agent마다 **티켓 없는 신규 세션**을 만들어 프롬프트를 보낸다 (`gates` 생략 시 무조건 발사; `agents` 생략 시 `type != human`이고 `runner_url` 있는 전원; 열린 티켓은 에이전트가 MCP로 조회).

```bash
# agents.yaml 예
# settings:
#   schedules:
#     - id: candy-pm-checkpoint
#       cron: "5,20,35,50 * * * *"
#       agents: [candy]
#       gates: [in_progress]   # 선택; In Progress(top·sub) 없으면 세션 생략
#       prompt: "…"
#     - id: weekday-check
#       cron: "0 9 * * 1-5"
#       prompt: "담당 열린 티켓 점검"
#     - id: finder-wiki
#       cron: "30 23 * * *"
#       agents: [finder]
#       prompt: "위키 리서치 후 main 직접 commit·push (PR/git-ship 금지)"
#       success_checks:
#         - "Changes are committed and pushed directly to the default branch (no PR)."
#         - "Do not run git-ship or gh pr create."

python3 deploy/k8s/scripts/sync-bridge-json.py
kubectl -n leantime get cronjob cursorbridge-schedule-tick
kubectl -n leantime exec deploy/leantime -- \
  php /var/www/html/app/Plugins/CursorBridge/bin/tick-schedules.php
```

`settings.budget`, `settings.success_checks`, `settings.success_retry.max_attempts`(기본 3)도 `sync-bridge-json.py`로 `bridge.json`에 반영된다. `success_checks`가 있으면 runner가 run 완료 후 `status=finished`와 마지막 Leantime mutation을 AND 판정하고, 실패 시 같은 세션에 `max_attempts`까지 교정 send를 보낸다(`agent-runner/DESIGN.md` 참조).

## 7. E2E (assignee = bot)

1. https://leantime.k8s-test — **사람** 계정으로 로그인  
2. 티켓 생성, Assignee = `path@example.com` (또는 로컬 `agents.yaml`의 path 이메일, user 6)  
3. 확인:
   - `kubectl -n leantime logs -f cursor-agent-path-0 -c agent-runner` → `session.create`  
   - `kubectl -n leantime exec deploy/leantime -- php -r '… sqlite sessions …'` 에 행 추가  

참고: Leantime 3.9는 티켓 이벤트 payload에 assignee가 없어 플러그인이 `getTicket`으로 보강한다. 코멘트는 `Comments` 도메인 이벤트가 없어 `notifyProjectUsers`(module=comments)로 수신한다.

## 8. PVC chat retention (수동)

agent별 PVC `cursor-data-cursor-agent-N-0` — 오래된 `~/.cursor/chats` 정리는 CronJob 또는 주기적 `kubectl exec`로 운영 정책에 맞게 설정.
