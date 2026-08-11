"""TDD: Kanban/To-Do board defaults status to not_done when unset."""

from __future__ import annotations

import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

import tickets_services_not_done as td  # noqa: E402

_SAMPLE = """\
    public function getTicketTemplateAssignments($params): array
    {
        $searchCriteria = $this->prepareTicketSearchArray($params);
        $searchCriteria['orderBy'] = 'kanbansort';

        $allTickets = $this->getAllGrouped($searchCriteria);
    }

    public function getProgramTicketTemplateAssignments(array $params, int $programId, array $childIds, array $availableProjects): array
    {
        $searchCriteria = $this->prepareTicketSearchArray($params);
        // Neutralize the single-project filter (currentProject is the program, which owns no
        // tickets); the board is scoped to the child projects via `projects` instead.
        $searchCriteria['currentProject'] = '';
        $searchCriteria['orderBy'] = 'kanbansort';
    }
"""


def test_inject_defaults_empty_status_on_both_board_paths():
    out = td.inject_not_done_default(_SAMPLE)
    assert out.count("$searchCriteria['status'] = 'not_done';") == 2
    assert "Factory default: open To-Dos only" in out
    # orderBy still follows the default block
    assert out.index("not_done") < out.index("$searchCriteria['orderBy'] = 'kanbansort';")


def test_inject_is_idempotent():
    once = td.inject_not_done_default(_SAMPLE)
    twice = td.inject_not_done_default(once)
    assert once == twice


def test_inject_rejects_unknown_source():
    try:
        td.inject_not_done_default("<?php // unrelated")
        assert False, "expected ValueError"
    except ValueError as e:
        assert "expected 3.9.7" in str(e)


def test_live_v397_file_if_present():
    upstream = Path("/tmp/Tickets.Services.3.9.7.php")
    if not upstream.is_file():
        return
    out = td.inject_not_done_default(upstream.read_text())
    assert td.already_patched(out)
    assert "getTicketTemplateAssignments" in out
