"""Inject factory Kanban/To-Do default status=not_done into Leantime Tickets Services."""

from __future__ import annotations

_BLOCK = """\
        $searchCriteria = $this->prepareTicketSearchArray($params);
        // Factory default: open To-Dos only (same as milestone overview). Explicit status wins.
        if ($searchCriteria['status'] == '') {
            $searchCriteria['status'] = 'not_done';
        }
"""

_MARKERS = (
    (
        """        $searchCriteria = $this->prepareTicketSearchArray($params);
        $searchCriteria['orderBy'] = 'kanbansort';

        $allTickets = $this->getAllGrouped($searchCriteria);""",
        _BLOCK
        + """        $searchCriteria['orderBy'] = 'kanbansort';

        $allTickets = $this->getAllGrouped($searchCriteria);""",
    ),
    (
        """        $searchCriteria = $this->prepareTicketSearchArray($params);
        // Neutralize the single-project filter (currentProject is the program, which owns no
        // tickets); the board is scoped to the child projects via `projects` instead.
        $searchCriteria['currentProject'] = '';
        $searchCriteria['orderBy'] = 'kanbansort';""",
        _BLOCK
        + """        // Neutralize the single-project filter (currentProject is the program, which owns no
        // tickets); the board is scoped to the child projects via `projects` instead.
        $searchCriteria['currentProject'] = '';
        $searchCriteria['orderBy'] = 'kanbansort';""",
    ),
)


def already_patched(source: str) -> bool:
    return source.count("Factory default: open To-Dos only") >= 2


def inject_not_done_default(source: str) -> str:
    """Return Tickets Services PHP with empty status defaulted to not_done on board views."""
    if already_patched(source):
        return source
    out = source
    for old, new in _MARKERS:
        if old not in out:
            raise ValueError("Tickets Services.php does not match expected 3.9.7 board assign sites")
        out = out.replace(old, new, 1)
    if not already_patched(out):
        raise ValueError("inject_not_done_default failed to apply both sites")
    return out
