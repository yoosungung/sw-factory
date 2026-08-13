"""Tests for blocked-by description markers and set_blocked_by."""

from unittest.mock import AsyncMock, patch

import pytest

from leantime_mcp.client import (
    BLOCKED_BY_MARKER_RE,
    apply_blocked_by_marker,
    parse_blocked_by,
    LeantimeClient,
)


@pytest.fixture
def client() -> LeantimeClient:
    return LeantimeClient("https://leantime.example.com", "pat-token-abc")


def test_parse_blocked_by_empty():
    assert parse_blocked_by("") == []
    assert parse_blocked_by("<p>no marker</p>") == []
    assert parse_blocked_by(None) == []


def test_parse_blocked_by_ids():
    html = "<p>Goal</p><!-- blocked-by:563,562 --><p>more</p>"
    assert parse_blocked_by(html) == [563, 562]


def test_apply_blocked_by_upsert_preserves_body():
    original = "<h2>Goal</h2><p>do things</p>"
    updated = apply_blocked_by_marker(original, [563])
    assert parse_blocked_by(updated) == [563]
    assert "<h2>Goal</h2><p>do things</p>" in updated
    assert BLOCKED_BY_MARKER_RE.search(updated)


def test_apply_blocked_by_replace_existing():
    original = "<!-- blocked-by:1 --><p>body</p>"
    updated = apply_blocked_by_marker(original, [563, 590])
    assert parse_blocked_by(updated) == [563, 590]
    assert updated.count("blocked-by") == 1
    assert "<p>body</p>" in updated


def test_apply_blocked_by_clear():
    original = "<p>x</p><!-- blocked-by:563 --><p>y</p>"
    updated = apply_blocked_by_marker(original, [])
    assert parse_blocked_by(updated) == []
    assert "blocked-by" not in updated
    assert "<p>x</p>" in updated and "<p>y</p>" in updated


@pytest.mark.asyncio
async def test_set_blocked_by_upserts_and_sets_status(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.side_effect = [
            {"id": 590, "description": "<p>incident</p>", "status": 4},
            True,
        ]

        result = await client.set_blocked_by(
            590, 6, blocker_ids=[563], status=1
        )

        assert call.await_count == 2
        get_method, get_params = call.await_args_list[0].args
        assert get_method == "leantime.rpc.Tickets.Tickets.getTicket"
        assert get_params == {"id": 590}

        patch_method, patch_params = call.await_args_list[1].args
        assert patch_method == "leantime.rpc.Tickets.Tickets.patchTicket"
        values = patch_params["values"]
        assert values["status"] == 1
        assert parse_blocked_by(values["description"]) == [563]
        assert "<p>incident</p>" in values["description"]
        assert result["ticket_id"] == 590
        assert result["blocked_by"] == [563]
        assert result["status"] == 1


@pytest.mark.asyncio
async def test_set_blocked_by_clear_without_status(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.side_effect = [
            {
                "id": 590,
                "description": "<!-- blocked-by:563 --><p>incident</p>",
                "status": 1,
            },
            True,
        ]

        result = await client.set_blocked_by(590, 6, blocker_ids=[])

        patch_params = call.await_args_list[1].args[1]
        values = patch_params["values"]
        assert "status" not in values
        assert parse_blocked_by(values["description"]) == []
        assert result["blocked_by"] == []
        assert result["status"] is None


@pytest.mark.asyncio
async def test_update_ticket_passes_depending_ticket_id(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.update_ticket(564, 6, dependingTicketId=100)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.patchTicket"
        assert params == {
            "id": 564,
            "values": {"dependingTicketId": 100},
        }
