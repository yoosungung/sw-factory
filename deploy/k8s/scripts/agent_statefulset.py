"""StatefulSet render helpers for per-agent runner pool and resources."""

from __future__ import annotations

import yaml


def runner_pool_env(agent: dict) -> str:
    """Optional AGENT_RUNNER_POOL_SIZE env block (2-space indent under env list items)."""
    raw = agent.get("pool_size")
    if raw is None:
        return ""
    size = int(raw)
    if size <= 0:
        return ""
    indent = "            "
    return (
        f"{indent}- name: AGENT_RUNNER_POOL_SIZE\n"
        f"{indent}  value: \"{size}\"\n"
    )


def container_resources_yaml(agent: dict) -> str:
    """Optional agent-runner container resources block."""
    res = agent.get("resources")
    if not res:
        return ""
    dumped = yaml.safe_dump(res, default_flow_style=False, sort_keys=False).strip()
    if not dumped:
        return ""
    lines = ["          resources:"]
    for line in dumped.splitlines():
        lines.append(f"            {line}")
    return "\n".join(lines)
