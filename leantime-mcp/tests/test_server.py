# SPDX-License-Identifier: MIT

import json
from unittest.mock import AsyncMock, patch

import pytest

from leantime_mcp import server


@pytest.fixture(autouse=True)
def reset_client():
    server.leantime_client = None
    yield
    server.leantime_client = None


def test_get_client_requires_url(monkeypatch):
    monkeypatch.delenv("LEANTIME_URL", raising=False)
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    with pytest.raises(ValueError, match="LEANTIME_URL"):
        server.get_client()


def test_get_client_requires_access_token(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.delenv("LEANTIME_ACCESS_TOKEN", raising=False)

    with pytest.raises(ValueError, match="LEANTIME_ACCESS_TOKEN"):
        server.get_client()


def test_get_client_passes_access_token(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat-xyz")
    monkeypatch.delenv("LEANTIME_SSL_VERIFY", raising=False)

    with patch("leantime_mcp.server.LeantimeClient") as client_cls:
        server.get_client()
        client_cls.assert_called_once_with(
            "https://leantime.example.com",
            "pat-xyz",
            verify_ssl=True,
        )


def test_get_client_honors_ssl_verify_env(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat-xyz")
    monkeypatch.setenv("LEANTIME_SSL_VERIFY", "false")

    with patch("leantime_mcp.server.LeantimeClient") as client_cls:
        server.get_client()
        client_cls.assert_called_once_with(
            "https://leantime.example.com",
            "pat-xyz",
            verify_ssl=False,
        )


@pytest.mark.asyncio
async def test_add_comment_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.add_comment.return_value = {"ok": True}
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.add_comment.fn("ticket", 1, "summary")

    mock_client.add_comment.assert_awaited_once_with(
        module="ticket", module_id=1, comment="summary"
    )
    assert json.loads(result) == {"ok": True}


@pytest.mark.asyncio
async def test_edit_comment_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.edit_comment.return_value = True
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.edit_comment.fn(55, "revised")

    mock_client.edit_comment.assert_awaited_once_with(55, "revised")
    assert json.loads(result) is True


@pytest.mark.asyncio
async def test_delete_comment_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.delete_comment.return_value = True
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.delete_comment.fn(55)

    mock_client.delete_comment.assert_awaited_once_with(55)
    assert json.loads(result) is True


@pytest.mark.asyncio
async def test_get_status_labels_tool_passes_project_id(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.get_status_labels.return_value = {"3": {"name": "New"}}
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.get_status_labels.fn(project_id=5)

    mock_client.get_status_labels.assert_awaited_once_with(project_id=5)
    assert json.loads(result) == {"3": {"name": "New"}}


@pytest.mark.asyncio
async def test_list_tickets_tool_passes_updated_since(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.list_tickets.return_value = [{"id": 1}]
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.list_tickets.fn(project_id=21, updated_since="2026-07-18")

    mock_client.list_tickets.assert_awaited_once_with(
        project_id=21, updated_since="2026-07-18", assigned_to=None
    )
    assert json.loads(result) == [{"id": 1}]


@pytest.mark.asyncio
async def test_list_tickets_tool_passes_assigned_to(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.list_tickets.return_value = [{"id": 2}]
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.list_tickets.fn(assigned_to=6)

    mock_client.list_tickets.assert_awaited_once_with(
        project_id=None, updated_since=None, assigned_to=6
    )
    assert json.loads(result) == [{"id": 2}]


@pytest.mark.asyncio
async def test_get_comments_tool_passes_since_and_mention(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.get_comments.return_value = [{"id": 7}]
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.get_comments.fn(
        "ticket", 99, since="2026-07-18", mentioned_user_id=4
    )

    mock_client.get_comments.assert_awaited_once_with(
        module="ticket",
        module_id=99,
        since="2026-07-18",
        mentioned_user_id=4,
    )
    assert json.loads(result) == [{"id": 7}]


@pytest.mark.asyncio
async def test_update_ticket_tool_delegates_partial_fields(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.update_ticket.return_value = True
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.update_ticket.fn(283, 21, status=2, assignedTo=4)

    mock_client.update_ticket.assert_awaited_once_with(
        283, 21, status=2, assignedTo=4
    )
    assert json.loads(result) is True


@pytest.mark.asyncio
async def test_create_ticket_tool_passes_milestoneid_and_sprint(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.create_ticket.return_value = 101
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.create_ticket.fn(
        "Item", 8, 2, milestoneid=55, sprint=3
    )

    kwargs = mock_client.create_ticket.await_args.kwargs
    assert kwargs["milestoneid"] == 55
    assert kwargs["sprint"] == 3
    assert json.loads(result) == 101


@pytest.mark.asyncio
async def test_update_ticket_tool_passes_milestoneid_and_sprint(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.update_ticket.return_value = True
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.update_ticket.fn(101, 8, milestoneid=55, sprint=3)

    mock_client.update_ticket.assert_awaited_once_with(
        101, 8, milestoneid=55, sprint=3
    )
    assert json.loads(result) is True


@pytest.mark.asyncio
async def test_update_ticket_tool_passes_depending_ticket_id(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.update_ticket.return_value = True
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.update_ticket.fn(564, 6, dependingTicketId=100)

    mock_client.update_ticket.assert_awaited_once_with(
        564, 6, dependingTicketId=100
    )
    assert json.loads(result) is True


@pytest.mark.asyncio
async def test_set_blocked_by_tool_delegates(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.set_blocked_by.return_value = {
        "ticket_id": 590,
        "blocked_by": [563],
        "status": 1,
        "description_snippet": "<!-- blocked-by:563 -->",
    }
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.set_blocked_by.fn(590, 6, [563], status=1)

    mock_client.set_blocked_by.assert_awaited_once_with(
        590, 6, blocker_ids=[563], status=1
    )
    assert json.loads(result)["blocked_by"] == [563]


@pytest.mark.asyncio
async def test_list_milestones_tool_delegates(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.list_milestones.return_value = [{"id": 55}]
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.list_milestones.fn(project_id=8)

    mock_client.list_milestones.assert_awaited_once_with(project_id=8)
    assert json.loads(result) == [{"id": 55}]


@pytest.mark.asyncio
async def test_create_milestone_tool_delegates(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.create_milestone.return_value = 55
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.create_milestone.fn(
        headline="M1", project_id=8, user_id=2
    )

    mock_client.create_milestone.assert_awaited_once_with(
        headline="M1", project_id=8, user_id=2, date=None, description=None
    )
    assert json.loads(result) == 55


@pytest.mark.asyncio
async def test_list_sprints_tool_delegates(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.list_sprints.return_value = [{"id": 3}]
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.list_sprints.fn(project_id=8)

    mock_client.list_sprints.assert_awaited_once_with(project_id=8)
    assert json.loads(result) == [{"id": 3}]


@pytest.mark.asyncio
async def test_list_ticket_files_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.list_ticket_files.return_value = [{"id": 1}]
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.list_ticket_files.fn(157)

    mock_client.list_ticket_files.assert_awaited_once_with(157)
    assert json.loads(result) == [{"id": 1}]


@pytest.mark.asyncio
async def test_upload_ticket_file_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.upload_ticket_file.return_value = {"fileId": "2"}
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.upload_ticket_file.fn(157, "/tmp/note.txt")

    mock_client.upload_ticket_file.assert_awaited_once_with(157, "/tmp/note.txt")
    assert json.loads(result) == {"fileId": "2"}


@pytest.mark.asyncio
async def test_download_ticket_file_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.download_ticket_file.return_value = {"encName": "abc", "content_base64": "aGk="}
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.download_ticket_file.fn("abc")

    mock_client.download_ticket_file.assert_awaited_once_with("abc")
    assert json.loads(result)["content_base64"] == "aGk="


@pytest.mark.asyncio
async def test_delete_ticket_file_tool_delegates_to_client(monkeypatch):
    monkeypatch.setenv("LEANTIME_URL", "https://leantime.example.com")
    monkeypatch.setenv("LEANTIME_ACCESS_TOKEN", "pat")

    mock_client = AsyncMock()
    mock_client.delete_ticket_file.return_value = True
    monkeypatch.setattr(server, "get_client", lambda: mock_client)

    result = await server.delete_ticket_file.fn(9)

    mock_client.delete_ticket_file.assert_awaited_once_with(9)
    assert json.loads(result) is True
