"""Tests for cursor-agent ServiceAccount RBAC (observer + operator)."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
RBAC = ROOT / "base" / "agent-rbac.yaml"


def _docs():
    return list(yaml.safe_load_all(RBAC.read_text()))


def test_cursor_agent_sa_exists():
    kinds = {(d.get("kind"), d.get("metadata", {}).get("name")) for d in _docs()}
    assert ("ServiceAccount", "cursor-agent") in kinds


def test_observer_is_cluster_scoped_for_infra_monitoring():
    docs = _docs()
    cluster_roles = [
        d for d in docs if d.get("kind") == "ClusterRole" and "observer" in d["metadata"]["name"]
    ]
    assert len(cluster_roles) == 1
    rules = cluster_roles[0]["rules"]
    core = next(r for r in rules if r.get("apiGroups") == [""] and "pods" in r.get("resources", []))
    assert "get" in core["verbs"] and "list" in core["verbs"]
    assert "pods/log" in core["resources"]
    # Cluster-wide PV/PVC discovery for infra operator.
    assert any(
        "persistentvolumes" in r.get("resources", []) or "persistentvolumeclaims" in r.get("resources", [])
        for r in rules
    )


def test_operator_rbac_denies_self_escalation_writes():
    docs = _docs()
    all_resources = {
        res
        for d in docs
        if d.get("kind") in ("Role", "ClusterRole")
        for r in d.get("rules", [])
        for res in r.get("resources", [])
    }
    assert "clusterroles" not in all_resources
    assert "clusterrolebindings" not in all_resources
    assert "roles" not in all_resources
    assert "rolebindings" not in all_resources


def test_path_graph_argo_workflow_rbac_for_cursor_agent():
    """path agent needs get/list (+ create/delete/patch for rerun) on workflows in path-graph."""
    docs = _docs()
    role = next(
        d
        for d in docs
        if d.get("kind") == "Role" and d["metadata"]["name"] == "cursor-agent-argo-workflows"
    )
    assert role["metadata"]["namespace"] == "path-graph"
    rule = next(r for r in role["rules"] if "workflows" in r.get("resources", []))
    assert rule["apiGroups"] == ["argoproj.io"]
    for verb in ("get", "list", "create", "delete", "patch"):
        assert verb in rule["verbs"]

    binding = next(
        d
        for d in docs
        if d.get("kind") == "RoleBinding"
        and d["metadata"]["name"] == "cursor-agent-argo-workflows"
    )
    assert binding["metadata"]["namespace"] == "path-graph"
    assert binding["roleRef"] == {
        "apiGroup": "rbac.authorization.k8s.io",
        "kind": "Role",
        "name": "cursor-agent-argo-workflows",
    }
    assert binding["subjects"] == [
        {"kind": "ServiceAccount", "name": "cursor-agent", "namespace": "leantime"}
    ]
