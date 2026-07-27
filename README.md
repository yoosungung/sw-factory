# cursor-agent

Leantime 티켓을 Cursor local agent 간 협업 채널로 사용하는 시스템입니다.

## 구성

| 컴포넌트 | 설명 |
|----------|------|
| [leantime-plugin/](leantime-plugin/) | CursorBridge — 이벤트·라우팅·세션 매핑 |
| [agent-runner/](agent-runner/) | SDK local agent HTTP API |
| [deploy/k8s/](deploy/k8s/) | K8s 매니페스트 (namespace `leantime`) |

계약·스키마는 [ARCHITECTURE.md](ARCHITECTURE.md), 일정은 [ROADMAP.md](ROADMAP.md)를 참고하세요.

## Quickstart (로컬)

```bash
# agent-runner
cd agent-runner
npm install
AGENT_RUNNER_MOCK=1 npm test
AGENT_RUNNER_MOCK=1 npm run dev
```

Leantime 플러그인은 `leantime-plugin/`을 Leantime `app/Plugins/CursorBridge/`에 설치 후 My Apps에서 활성화합니다.

### leantime-mcp (로컬 Cursor)

```bash
cd leantime-mcp
cp .env.example .env   # LEANTIME_ACCESS_TOKEN 입력
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

저장소 `.cursor/mcp.json`이 로컬 포크를 사용한다. Cursor 재시작 후 MCP **leantime**을 확인하세요. 상세는 [leantime-mcp/DESIGN.md](leantime-mcp/DESIGN.md).

K8s 배포는 [deploy/SETUP.md](deploy/SETUP.md)를 참고하세요.

민감 설정(`agents.yaml`, `bridge.json`, persona `MEMORY.md`)은 gitignore됩니다. 클론 후:

```bash
./scripts/bootstrap-config.sh
# 실계정으로 agents.yaml / MEMORY.md 수정 → sync-bridge-json.py
```
