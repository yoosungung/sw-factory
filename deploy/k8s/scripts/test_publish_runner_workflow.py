"""Sanity checks for publish-runner GitHub Actions workflow (A안)."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
WF = ROOT / ".github" / "workflows" / "publish-runner.yml"


def test_publish_runner_workflow_dispatch_and_packages_write():
    data = yaml.safe_load(WF.read_text())
    assert "workflow_dispatch" in data["on"]
    assert data["permissions"]["packages"] == "write"
    assert data["permissions"]["contents"] == "read"
    job = data["jobs"]["publish"]
    steps = job["steps"]
    push = next(s for s in steps if s.get("uses", "").startswith("docker/build-push-action"))
    assert push["with"]["push"] is True
    assert "agent-runner/Dockerfile" in push["with"]["file"]
