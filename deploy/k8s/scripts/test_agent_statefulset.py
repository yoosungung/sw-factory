"""Tests for per-agent StatefulSet render helpers."""

from agent_statefulset import container_resources_yaml, runner_pool_env


def test_runner_pool_env_empty_when_unset():
    assert runner_pool_env({"name": "pm"}) == ""


def test_runner_pool_env_renders_size():
    out = runner_pool_env({"pool_size": 4})
    assert "AGENT_RUNNER_POOL_SIZE" in out
    assert 'value: "4"' in out


def test_container_resources_empty_when_unset():
    assert container_resources_yaml({"name": "pm"}) == ""


def test_container_resources_renders_memory():
    out = container_resources_yaml(
        {
            "resources": {
                "requests": {"memory": "4Gi"},
                "limits": {"memory": "16Gi"},
            }
        }
    )
    assert "resources:" in out
    assert "memory: 4Gi" in out
    assert "memory: 16Gi" in out
