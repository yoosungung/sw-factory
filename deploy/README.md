# deploy/

| 경로 | 용도 |
|------|------|
| [SETUP.md](SETUP.md) | Cloudflare Workers 배포·시크릿·도메인 |
| `env.example` · `agents.yaml.example` | local·k8s 공유 설정 예제 |
| [docker/](docker/) | agent Dockerfile·entrypoint·`build.sh` |
| [local/](local/) | 로컬 Docker 실행·작업용 `.env` / `agents.yaml` |
| [k8s/](k8s/) | Kubernetes 매니페스트·`apply.sh` (`NS=sw-factory`) |
| [personas/](personas/) | MEMORY·skills·rules (`_default` + pm/ta/qa/aa/km) |

로컬 빠른 경로:

```bash
cd deploy/local
cp ../env.example .env
./obtain-cookie.sh   # 선택
./run-local.sh
```

클러스터: [k8s/README.md](k8s/README.md) (`apply.sh`가 `../agents.yaml.example`로 ConfigMap 생성).
