# SPDX-License-Identifier: MIT

import base64
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from leantime_mcp.client import LeantimeAPIError, LeantimeClient


@pytest.fixture
def client() -> LeantimeClient:
    return LeantimeClient("https://leantime.example.com", "pat-token-abc")


@pytest.mark.asyncio
async def test_list_ticket_files_uses_files_rpc(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = [{"id": 1, "realName": "doc.txt"}]

        result = await client.list_ticket_files(157)

        call.assert_awaited_once_with(
            "leantime.rpc.Files.Files.getFilesByModule",
            {"module": "ticket", "entityId": 157},
        )
        assert result == [{"id": 1, "realName": "doc.txt"}]


@pytest.mark.asyncio
async def test_delete_ticket_file_uses_files_rpc(client: LeantimeClient):
    with patch.object(client, "call", new_callable=AsyncMock) as call:
        call.return_value = True

        result = await client.delete_ticket_file(9)

        call.assert_awaited_once_with(
            "leantime.rpc.Files.Files.deleteFile",
            {"fileId": 9},
        )
        assert result is True


@pytest.mark.asyncio
async def test_upload_ticket_file_posts_multipart(client: LeantimeClient, tmp_path: Path):
    upload_path = tmp_path / "note.txt"
    upload_path.write_text("hello")

    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {
        "fileId": "3",
        "encName": "abc123",
        "realName": "note.txt",
        "extension": "txt",
    }

    http_client = AsyncMock()
    http_client.post = AsyncMock(return_value=response)
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=http_client)
    context.__aexit__ = AsyncMock(return_value=None)

    with patch("httpx.AsyncClient", return_value=context):
        result = await client.upload_ticket_file(157, str(upload_path))

    post = http_client.post.await_args
    assert post.args[0] == "https://leantime.example.com/files/upload?module=ticket&moduleId=157"
    assert post.kwargs["headers"]["Authorization"] == "Bearer pat-token-abc"
    assert "file" in post.kwargs["files"]
    assert result["fileId"] == "3"


@pytest.mark.asyncio
async def test_upload_ticket_file_missing_path(client: LeantimeClient):
    with pytest.raises(FileNotFoundError, match="missing.txt"):
        await client.upload_ticket_file(157, "/tmp/missing.txt")


@pytest.mark.asyncio
async def test_upload_ticket_file_api_error(client: LeantimeClient, tmp_path: Path):
    upload_path = tmp_path / "note.txt"
    upload_path.write_text("hello")

    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.json.return_value = {"status": "error", "message": "too large"}

    http_client = AsyncMock()
    http_client.post = AsyncMock(return_value=response)
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=http_client)
    context.__aexit__ = AsyncMock(return_value=None)

    with patch("httpx.AsyncClient", return_value=context):
        with pytest.raises(LeantimeAPIError, match="too large"):
            await client.upload_ticket_file(157, str(upload_path))


@pytest.mark.asyncio
async def test_download_ticket_file_returns_base64(client: LeantimeClient):
    response = MagicMock()
    response.raise_for_status = MagicMock()
    response.content = b"hello"
    response.headers = {
        "content-type": "text/plain;charset=UTF-8",
        "content-disposition": 'inline; filename="note.txt"',
    }

    http_client = AsyncMock()
    http_client.get = AsyncMock(return_value=response)
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=http_client)
    context.__aexit__ = AsyncMock(return_value=None)

    with patch("httpx.AsyncClient", return_value=context):
        result = await client.download_ticket_file("abc123")

    get = http_client.get.await_args
    assert get.args[0] == "https://leantime.example.com/files/get"
    assert get.kwargs["params"] == {"encName": "abc123"}
    assert get.kwargs["headers"]["Authorization"] == "Bearer pat-token-abc"
    assert result["encName"] == "abc123"
    assert result["filename"] == "note.txt"
    assert result["content_type"] == "text/plain;charset=UTF-8"
    assert base64.b64decode(result["content_base64"]) == b"hello"
