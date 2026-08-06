# SPDX-License-Identifier: MIT

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from leantime_mcp.client import LeantimeClient


def _mock_http_client() -> MagicMock:
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"result": True}

    client = AsyncMock()
    client.post = AsyncMock(return_value=response)

    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=None)
    return context


@pytest.fixture
def client() -> LeantimeClient:
    return LeantimeClient("https://leantime.example.com", "pat-token-abc")


@pytest.mark.asyncio
async def test_call_uses_bearer_header(client: LeantimeClient):
    with patch("httpx.AsyncClient", return_value=_mock_http_client()) as client_cls:
        await client.call("leantime.rpc.Projects.getAll")

        assert client_cls.call_args.kwargs["verify"] is True
        post = client_cls.return_value.__aenter__.return_value.post
        headers = post.await_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer pat-token-abc"
        assert "X-API-KEY" not in headers


@pytest.mark.asyncio
async def test_call_can_disable_ssl_verify():
    client = LeantimeClient("https://leantime.example.com", "pat", verify_ssl=False)
    with patch("httpx.AsyncClient", return_value=_mock_http_client()) as client_cls:
        await client.call("leantime.rpc.Projects.getAll")

        assert client_cls.call_args.kwargs["verify"] is False


@pytest.mark.asyncio
async def test_add_comment_uses_comments_rpc(client: LeantimeClient):
    client.get_ticket = AsyncMock(return_value={"projectId": 42})

    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.add_comment("ticket", 99, "hello")

        method, params = call.await_args.args
        assert method == "leantime.rpc.Comments.Comments.addComment"
        assert params["values"]["text"] == "hello"
        assert params["values"]["ticketId"] == 99
        assert params["values"]["projectId"] == 42
        assert "userId" not in params["values"]


@pytest.mark.asyncio
async def test_edit_comment_uses_comments_rpc(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.edit_comment(55, "updated text")

        method, params = call.await_args.args
        assert method == "leantime.rpc.Comments.Comments.editComment"
        assert params == {"id": 55, "values": {"text": "updated text"}}


@pytest.mark.asyncio
async def test_delete_comment_uses_comments_rpc(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.delete_comment(55)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Comments.Comments.deleteComment"
        assert params == {"commentId": 55}


@pytest.mark.asyncio
async def test_list_tickets_filters_by_updated_since(client: LeantimeClient):
    tickets = [
        {"id": 1, "modified": "2026-07-20 10:00:00"},
        {"id": 2, "modified": "2026-07-10 10:00:00"},
        {"id": 3, "date": "2026-07-22 08:00:00"},  # no modified → fall back to date
        {"id": 4, "modified": "2026-07-18T12:00:00"},
    ]
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = tickets

        result = await client.list_tickets(updated_since="2026-07-18")

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.getAll"
        assert params == {"searchCriteria": {}}
        assert [t["id"] for t in result] == [1, 3, 4]


@pytest.mark.asyncio
async def test_list_tickets_filters_by_assigned_to(client: LeantimeClient):
    tickets = [
        {"id": 1, "editorId": 6},
        {"id": 2, "assignedTo": "6"},
        {"id": 3, "editorId": 9},
        {"id": 4, "editorId": 0},
        {"id": 5},
    ]
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = tickets

        result = await client.list_tickets(assigned_to=6)

        assert [t["id"] for t in result] == [1, 2]


@pytest.mark.asyncio
async def test_list_tickets_assigned_to_and_updated_since(client: LeantimeClient):
    tickets = [
        {"id": 1, "editorId": 6, "modified": "2026-07-20 10:00:00"},
        {"id": 2, "editorId": 6, "modified": "2026-07-10 10:00:00"},
        {"id": 3, "editorId": 9, "modified": "2026-07-20 10:00:00"},
    ]
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = tickets

        result = await client.list_tickets(assigned_to=6, updated_since="2026-07-18")

        assert [t["id"] for t in result] == [1]


@pytest.mark.asyncio
async def test_list_tickets_passes_project_and_skips_filter_without_since(
    client: LeantimeClient,
):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = [{"id": 9, "modified": "2020-01-01 00:00:00"}]

        result = await client.list_tickets(project_id=21)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.getAll"
        assert params == {"searchCriteria": {"currentProject": 21}}
        assert result == [{"id": 9, "modified": "2020-01-01 00:00:00"}]


@pytest.mark.asyncio
async def test_get_comments_filters_since_and_mentioned_user(client: LeantimeClient):
    comments = [
        {
            "id": 1,
            "date": "2026-07-20 10:00:00",
            "text": '<a class="tiptap-mention" data-tagged-user-id="4">@pm</a> hi',
        },
        {
            "id": 2,
            "date": "2026-07-10 10:00:00",
            "text": '<a data-tagged-user-id="4">@pm</a> old',
        },
        {
            "id": 3,
            "date": "2026-07-21 10:00:00",
            "text": '<a data-tagged-user-id="6">@path</a> other',
        },
        {
            "id": 4,
            "date": "2026-07-22 10:00:00",
            "text": "plain @pm text is not a mention",
        },
    ]
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = comments

        result = await client.get_comments(
            "ticket", 99, since="2026-07-18", mentioned_user_id=4
        )

        method, params = call.await_args.args
        assert method == "leantime.rpc.Comments.Comments.getComments"
        # parent=-1: Leantime skips commentParent filter (include replies).
        assert params == {"module": "ticket", "entityId": 99, "parent": -1}
        assert [c["id"] for c in result] == [1]


@pytest.mark.asyncio
async def test_get_comments_requests_all_parents_including_replies(client: LeantimeClient):
    """Default Leantime parent=0 hides replies; MCP must pass parent=-1."""
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = [
            {"id": 10, "commentParent": 0, "text": "top"},
            {"id": 11, "commentParent": 10, "text": "reply"},
        ]

        result = await client.get_comments("ticket", 32)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Comments.Comments.getComments"
        assert params["parent"] == -1
        assert [c["id"] for c in result] == [10, 11]


@pytest.mark.asyncio
async def test_get_status_labels_passes_project_id(client: LeantimeClient):
    """Optional project_id must reach JSON-RPC as projectId (#60 cache poison)."""
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = {"3": {"name": "New"}}

        result = await client.get_status_labels(project_id=5)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.getStatusLabels"
        assert params == {"projectId": 5}
        assert result == {"3": {"name": "New"}}


@pytest.mark.asyncio
async def test_get_status_labels_omits_params_when_no_project(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = {}

        await client.get_status_labels()

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.getStatusLabels"
        assert params == {}


@pytest.mark.asyncio
async def test_update_ticket_uses_patch_not_full_update(client: LeantimeClient):
    """updateTicket wipes omitted fields; patchTicket is partial-safe."""
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.update_ticket(283, 21, status=2, assignedTo=4)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.patchTicket"
        assert params == {"id": 283, "values": {"status": 2, "editorId": 4}}
        assert "description" not in params["values"]
        assert "assignedTo" not in params["values"]


@pytest.mark.asyncio
async def test_update_ticket_maps_description_headline_priority(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.update_ticket(
            10, 1, headline="h", description="<p>d</p>", priority="3"
        )

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.patchTicket"
        assert params["values"] == {
            "headline": "h",
            "description": "<p>d</p>",
            "priority": "3",
        }


@pytest.mark.asyncio
async def test_create_ticket_passes_milestoneid_and_sprint(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = 101

        await client.create_ticket(
            "Item",
            8,
            2,
            date="2026-08-06",
            milestoneid=55,
            sprint=3,
        )

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.addTicket"
        assert params["values"]["milestoneid"] == 55
        assert params["values"]["sprint"] == 3
        assert params["values"]["headline"] == "Item"


@pytest.mark.asyncio
async def test_update_ticket_passes_milestoneid_and_sprint(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        await client.update_ticket(101, 8, milestoneid=55, sprint=3)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.patchTicket"
        assert params == {"id": 101, "values": {"milestoneid": 55, "sprint": 3}}


@pytest.mark.asyncio
async def test_list_milestones_uses_get_all_milestones(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = [{"id": 55, "headline": "M1"}]

        result = await client.list_milestones(project_id=8)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.getAllMilestones"
        assert params == {"searchCriteria": {"currentProject": 8}}
        assert result == [{"id": 55, "headline": "M1"}]


@pytest.mark.asyncio
async def test_create_milestone_uses_add_ticket_type_milestone(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = 55

        await client.create_milestone(
            headline="M1 — Feature",
            project_id=8,
            user_id=2,
            date="2026-08-06",
        )

        method, params = call.await_args.args
        assert method == "leantime.rpc.Tickets.Tickets.addTicket"
        assert params["values"]["type"] == "milestone"
        assert params["values"]["headline"] == "M1 — Feature"
        assert params["values"]["projectId"] == 8
        assert params["values"]["userId"] == 2


@pytest.mark.asyncio
async def test_list_sprints_uses_get_all_sprints(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = [{"id": 3, "name": "Sprint 1"}]

        result = await client.list_sprints(project_id=8)

        method, params = call.await_args.args
        assert method == "leantime.rpc.Sprints.Sprints.getAllSprints"
        assert params == {"projectId": 8}
        assert result == [{"id": 3, "name": "Sprint 1"}]
