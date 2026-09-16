# Agent Docker image

이미지 정의·빌드만. 로컬 실행은 [../local/](../local/), 클러스터는 [../k8s/](../k8s/).

**이미지 레이아웃 (소스 덤프 금지):**

| 경로 | 내용 |
|------|------|
| `/app/agent/{shared,gateway/src,cursor/src,cursor/mcp}` | **공통** runtime 코드만 |
| `/opt/persona-seed/{persona}/` | 빌드 시 `_default`⊕overlay **머지된** MEMORY·skills·rules |
| `/data/workspaces/{persona}/` | PVC — entrypoint가 seed를 적용 (MEMORY seed-once) |

원본 overlay 트리(`deploy/personas/_default`+…)는 **빌드 스테이지에서만** 쓰고 최종 이미지에 넣지 않는다.  
의존성: 루트 `package.json`(FE/Workers)이 아니라 **`deploy/docker/package.json`**(agent 최소: `@cursor/sdk`·hono·yaml·tsx).  
`AGENT_APP_ROOT=/app` — factory-mcp stdio 절대경로. entrypoint apply 시 cookie workspace의 mcp.json을 refresh.

```bash
cd deploy/docker
./build.sh
# IMAGE=sw-factory-agent:local (기본)
```

| 파일 | 역할 |
|------|------|
| `Dockerfile` | multi-stage: persona seed 준비 → slim runtime + `/opt/persona-seed` |
| `package.json` / `package-lock.json` | agent 이미지 전용 npm deps (루트 lock과 분리) |
| `entrypoint.sh` | apply persona seeds → ensure-repos → cursor listen → gateway poll |
| `build.sh` | `docker build` (context = repo root) |
