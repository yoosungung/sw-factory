# agent/cursor

GitHub [agent-runner](https://github.com/yoosungung/sw-factory/tree/main/agent-runner) + persona workspace 대응.  
**역할: MCP로 티켓 시스템을 읽고 작업한다.** 이벤트 구독·라우팅은 [../gateway/](../gateway/) 몫.

내부 설계: [DESIGN.md](DESIGN.md) · 상세: [docs/](docs/) · 참고: [reference/](reference/)  
계약: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

## GitHub 대비

| GitHub | 이 컴포넌트 |
|--------|-------------|
| Pod당 `cursor-agent-{name}` + PVC | **컨테이너 1개** · `workspaces/{name}/` · **PVC 1개(경로 격리)** |
| parent + SDK worker pool × N Pod | **공유** parent + worker pool (병렬 knobs) |
| leantime-mcp + PAT | **factory-mcp** + persona **세션 쿠키** |
| Bridge가 push wake | gateway가 prompt 배달 → 이 런타임은 202 accept |

## 읽기 순서

1. [docs/01-workspaces.md](docs/01-workspaces.md)
2. [docs/02-runner.md](docs/02-runner.md)
3. [docs/03-concurrency.md](docs/03-concurrency.md)
4. [docs/04-pvc-layout.md](docs/04-pvc-layout.md)
5. [docs/05-factory-mcp.md](docs/05-factory-mcp.md)
6. [docs/06-personas-protocol.md](docs/06-personas-protocol.md)
7. [docs/07-auth-as-user.md](docs/07-auth-as-user.md)
8. [reference/](reference/)
