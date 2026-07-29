"""TDD: clients[] ≡ Leantime client_id + status_board (M11)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
import yaml

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from clients import (  # noqa: E402
    LOOP_STATUS_NAMES,
    index_clients,
    resolve_status_id,
    validate_status_board,
)


def test_loop_status_names_cover_dual_loop():
    assert "Deploying Test" in LOOP_STATUS_NAMES
    assert "QA" in LOOP_STATUS_NAMES
    assert "Deploying Prod" in LOOP_STATUS_NAMES
    assert "Done" in LOOP_STATUS_NAMES


def test_index_clients_requires_unique_client_id():
    with pytest.raises(ValueError, match="leantime_client_id"):
        index_clients(
            [
                {"leantime_client_id": 1, "repo_ids": ["a"], "project_id": 10},
                {"leantime_client_id": 1, "repo_ids": ["b"], "project_id": 11},
            ]
        )


def test_index_clients_maps_repo_to_client():
    by_id, repo_to_client = index_clients(
        [
            {
                "id": "acme",
                "leantime_client_id": 42,
                "repo_ids": ["landing-web", "shop-api"],
                "project_id": 7,
            }
        ]
    )
    assert by_id[42]["id"] == "acme"
    assert repo_to_client["landing-web"] == 42
    assert repo_to_client["shop-api"] == 42


def test_validate_status_board_requires_all_names():
    with pytest.raises(ValueError, match="Review"):
        validate_status_board({"New": 3, "In Progress": 4, "Done": 0})


def test_resolve_status_id_prefers_client_map():
    board = {name: i for i, name in enumerate(LOOP_STATUS_NAMES)}
    client = {
        "leantime_client_id": 1,
        "status_map": {**board, "QA": 99},
    }
    assert resolve_status_id("QA", client=client, default_board=board) == 99
    assert resolve_status_id("Done", client=client, default_board=board) == board["Done"]


def test_agents_yaml_sample_has_clients():
    root = SCRIPTS.parents[2]
    sample = yaml.safe_load((root / "deploy/k8s/agents.yaml.sample").read_text())
    assert "clients" in sample
    by_id, repo_to_client = index_clients(sample["clients"])
    assert len(by_id) >= 1
    assert "landing-web" in repo_to_client
    board = sample.get("settings", {}).get("status_board")
    if board:
        validate_status_board(board)
