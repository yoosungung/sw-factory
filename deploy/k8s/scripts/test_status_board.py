"""TDD: dual-loop ticket status labels → Leantime projectsettings.*.ticketlabels."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import status_board as sb  # noqa: E402


def test_dual_loop_labels_include_required_ids():
    labels = sb.dual_loop_status_labels()
    for sid in (0, 1, 2, 3, 4, 10, 11, 12, 13, -1):
        assert sid in labels
    assert labels[3]["name"] == "New"
    assert labels[4]["name"] == "In Progress"
    assert labels[10]["name"] == "Review"
    assert labels[11]["name"] == "Deploying Test"
    assert labels[12]["name"] == "QA"
    assert labels[13]["name"] == "Deploying Prod"
    assert labels[0]["statusType"] == "DONE"
    assert labels[-1]["name"] == "Archived"
    assert labels[3]["statusType"] == "NEW"


def test_settings_key():
    assert sb.ticketlabels_settings_key(5) == "projectsettings.5.ticketlabels"


def test_board_from_agents_yaml_maps_names():
    board = {
        "New": 3,
        "Blocked": 1,
        "In Progress": 4,
        "Waiting for Approval": 2,
        "Review": 10,
        "Deploying Test": 11,
        "QA": 12,
        "Deploying Prod": 13,
        "Done": 0,
    }
    labels = sb.labels_from_status_board(board)
    assert labels[12]["name"] == "QA"
    assert labels[11]["kanbanCol"] is True
