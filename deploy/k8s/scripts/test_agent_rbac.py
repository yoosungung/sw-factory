"""Tests for cursor-agent / cursor-agent-ta ServiceAccount RBAC (least privilege)."""

from __future__ import annotations

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
RBAC = ROOT / "base" / "agent-rbac.yaml"


def _docs():
    return list(yaml.safe_load_all(RBAC.read_text()))


def test_cursor_agent_and_ta_sa_exist():
    kinds = {(d.get("kind"), d.get("metadata", {}).get("name")) for d in _docs()}
    assert ("ServiceAccount", "cursor-agent") in kinds
    assert ("ServiceAccount", "cursor-agent-ta") in kinds


def test_observer_is_read_only_for_non_ta():
    docs = _docs()
    observer = next(
        d
        for d in docs
        if d.get("kind") == "ClusterRole" and d["metadata"]["name"] == "cursor-agent-observer"
    )
    verbs = {v for r in observer["rules"] for v in r.get("verbs", [])}
    assert "get" in verbs and "list" in verbs and "watch" in verbs
    for banned in ("create", "update", "patch", "delete"):
        assert banned not in verbs

    binding = next(
        d
        for d in docs
        if d.get("kind") == "ClusterRoleBinding"
        and d["metadata"]["name"] == "cursor-agent-observer"
    )
    assert binding["subjects"] == [
        {"kind": "ServiceAccount", "name": "cursor-agent", "namespace": "sw-factory"}
    ]


def test_ta_operator_has_mutate_and_namespace_create():
    docs = _docs()
    ta_role = next(
        d
        for d in docs
        if d.get("kind") == "ClusterRole"
        and d["metadata"]["name"] == "cursor-agent-ta-operator"
    )
    assert any(
        "persistentvolumes" in r.get("resources", []) or "persistentvolumeclaims" in r.get("resources", [])
        for r in ta_role["rules"]
    )
    ns_write = next(
        r
        for r in ta_role["rules"]
        if r.get("apiGroups") == [""] and r.get("resources") == ["namespaces"]
    )
    assert "create" in ns_write["verbs"]
    assert "delete" not in ns_write["verbs"]

    binding = next(
        d
        for d in docs
        if d.get("kind") == "ClusterRoleBinding"
        and d["metadata"]["name"] == "cursor-agent-ta-operator"
    )
    assert binding["subjects"] == [
        {"kind": "ServiceAccount", "name": "cursor-agent-ta", "namespace": "sw-factory"}
    ]


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


def test_path_graph_argo_bound_to_ta_sa():
    """Argo Role currently bound to ta SA (path bot not in soft-factory staff)."""
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
    assert binding["subjects"] == [
        {"kind": "ServiceAccount", "name": "cursor-agent-ta", "namespace": "sw-factory"}
    ]


def test_test_ns_write_bound_to_ta_only():
    """TA Deploying Test: full app stack write in test NS (CM/Secret/Svc/PVC/Ingress/workload)."""
    docs = _docs()
    for ns in ("sw-factory", "nl2sql"):
        role = next(
            d
            for d in docs
            if d.get("kind") == "Role"
            and d["metadata"]["name"] == "cursor-agent-test-ns-write"
            and d["metadata"]["namespace"] == ns
        )
        resources = {res for r in role["rules"] for res in r.get("resources", [])}
        for needed in (
            "configmaps",
            "secrets",
            "services",
            "persistentvolumeclaims",
            "ingresses",
            "deployments",
            "statefulsets",
            "pods",
        ):
            assert needed in resources

        binding = next(
            d
            for d in docs
            if d.get("kind") == "RoleBinding"
            and d["metadata"]["name"] == "cursor-agent-test-ns-write"
            and d["metadata"]["namespace"] == ns
        )
        assert binding["subjects"] == [
            {"kind": "ServiceAccount", "name": "cursor-agent-ta", "namespace": "sw-factory"}
        ]
