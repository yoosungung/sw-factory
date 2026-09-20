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
머지·적용: [persona-bundle](../src/persona-bundle.ts) (`buildPersonaBundle` · `applyPersonaBundle` · `preparePersonaSeeds` · `applyPreparedPersonaSeed`).  
`MEMORY.md`는 **seed-once**(파일 없을 때만). skills/rules는 재시드 시 overwrite.  
세션 쿠키·`mcp.json`은 기동 시 [seed-cookies-cli](../src/seed-cookies-cli.ts)가 persona마다 factory 로그인으로 쓴다(`PERSONA_PASSWORD`). `GATEWAY_SESSION_COOKIE`는 gateway 폴링 전용이라 workspace에 복사하지 않는다. stdio 진입점은 **절대 경로**(`AGENT_APP_ROOT`, Docker=`/app`). 쿠키가 이미 있으면 apply-persona-seeds가 mcp.json 경로만 refresh한다.  
**Repo ensure:** seed 시 `agents.yaml` `repos[]` + agent `primary_repo`/`repo_ids`로 `repos/{id}` clone-if-missing·fetch ([ensure-repos](../src/ensure-repos.ts)); `.cursor/clients-repos-registry.json` 기록. `GH_TOKEN`/`GITHUB_TOKEN` 필요(private).  
**Docker 이미지:** 빌드가 overlay를 `/opt/persona-seed/{persona}/`로 머지해 넣고, entrypoint가 PVC workspace에 적용. 원본 overlay는 최종 이미지에 없음 ([deploy/docker/README](../../../deploy/docker/README.md)).  
k8s/Docker: Pod 기동 시 persona seed + **persona별 로그인 쿠키** + `ensure-repos-cli`. 쿠키 시드만 끄기: `SEED_PERSONA_COOKIES=0`. Job [job-seed-personas](../../../deploy/k8s/job-seed-personas.yaml)는 번들·ensure까지 한 번에 할 때.

## 규칙

- gateway·다른 persona 디렉터리를 읽거나 쓰지 않는다.
- SDK `local` runtime `cwd`는 해당 workspace.
- 동일 tenant repo가 필요하면 persona 아래 **복제 checkout** (공유 clone/하드링크 기본 금지) — [04-pvc-layout](04-pvc-layout.md).
