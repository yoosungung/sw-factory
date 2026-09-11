# Agent Docker image

이미지 정의·빌드만. 로컬 실행은 [../local/](../local/), 클러스터는 [../k8s/](../k8s/).

```bash
cd deploy/docker
./build.sh
# IMAGE=sw-factory-agent:local (기본)
```

| 파일 | 역할 |
|------|------|
| `Dockerfile` | gateway+cursor 단일 이미지 |
| `entrypoint.sh` | cursor listen → gateway poll |
| `build.sh` | `docker build` (context = repo root) |
