# deploy/

| 경로 | 용도 |
|------|------|
| [SETUP.md](SETUP.md) | Cloudflare Workers 배포·시크릿·도메인 |
| `agents.yaml` | **공유 정본**(gitignore) — local·seed·k8s ConfigMap |
| `agents.yaml.example` | 커밋용 템플릿 |
| `agents.back.yaml` | v1 실정의 스냅샷(clients/schedules 등; schedules는 A8 전 미사용) |
| `env.example` | local `.env` 템플릿 |
| [docker/](docker/) | agent Dockerfile·entrypoint·`build.sh` |
| [local/](local/) | 로컬 Docker 실행·`.env` (`agents.yaml` → `../agents.yaml` 링크) |
| [k8s/](k8s/) | Kubernetes 매니페스트·`apply.sh` (`NS=sw-factory`); repo ensure = entrypoint + seed Job |
| [personas/](personas/) | MEMORY·skills·rules (`_default` + pm/ta/qa/aa/km) |

로컬 빠른 경로:

```bash
# 정본: deploy/agents.yaml (없으면 example에서 복사)
cd deploy/local
cp ../env.example .env
# PERSONA_PASSWORD 설정 후:
./register-agent-users.sh   # factory user 생성 → user_id 기입 (상세: local/README.md)
./obtain-cookie.sh   # 선택
./run-local.sh
```

클러스터: [k8s/README.md](k8s/README.md) — `apply.sh` 기본 `../agents.yaml`(없으면 example).
