# SPDX-FileCopyrightText: 2025 Daniel Eder
#
# SPDX-License-Identifier: MIT

"""Leantime JSON-RPC 2.0 client implementation."""

import logging
import re
from datetime import datetime
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_MENTION_USER_RE = re.compile(
    r'data-tagged-user-id=["\'](\d+)["\']',
    re.IGNORECASE,
)


def _parse_datetime(value: str) -> datetime:
    """Parse ISO or Leantime ``YYYY-MM-DD[ HH:MM:SS]`` timestamps as naive UTC."""
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    if " " in text and "T" not in text:
        text = text.replace(" ", "T", 1)
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError(f"Invalid datetime: {value!r}") from exc
    if parsed.tzinfo is not None:
        from datetime import timezone

        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _item_timestamp(item: dict, fields: tuple[str, ...]) -> Optional[datetime]:
    for field in fields:
        raw = item.get(field)
        if raw is None or raw == "":
            continue
        try:
            return _parse_datetime(str(raw))
        except ValueError:
            continue
    return None


def _filter_since(
    items: list,
    since: str,
    fields: tuple[str, ...],
) -> list:
    cutoff = _parse_datetime(since)
    filtered: list = []
    for item in items:
        if not isinstance(item, dict):
            continue
        ts = _item_timestamp(item, fields)
        if ts is not None and ts >= cutoff:
            filtered.append(item)
    return filtered


def _mentions_user(text: str, user_id: int) -> bool:
    for match in _MENTION_USER_RE.finditer(text or ""):
        if int(match.group(1)) == user_id:
            return True
    return False


class LeantimeAPIError(Exception):
    """Exception raised for Leantime API errors."""

    def __init__(self, code: int, message: str, data: Any = None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"Leantime API Error {code}: {message}")


class LeantimeClient:
    """Client for interacting with Leantime's JSON-RPC 2.0 API via Bearer PAT."""

    def __init__(self, base_url: str, access_token: str, *, verify_ssl: bool = True):
        self.base_url = base_url.rstrip("/")
        self.access_token = access_token
        self.verify_ssl = verify_ssl
        self.endpoint = f"{self.base_url}/api/jsonrpc"
        self._request_id = 0

    def _auth_headers(self) -> dict[str, str]:
        if not self.access_token:
            raise ValueError("LEANTIME_ACCESS_TOKEN is required")
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.access_token}",
        }

    def _get_next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def call(self, method: str, params: Optional[dict] = None) -> Any:
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params or {},
            "id": self._get_next_id(),
        }

        logger.debug("Calling Leantime RPC: %s with params: %s", method, params)

        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            response = await client.post(
                self.endpoint,
                json=payload,
                headers=self._auth_headers(),
                timeout=30.0,
            )
            response.raise_for_status()

            data = response.json()

            if "error" in data:
                error = data["error"]
                raise LeantimeAPIError(
                    code=error.get("code", -1),
                    message=error.get("message", "Unknown error"),
                    data=error.get("data"),
                )

            return data.get("result")

    async def get_project(self, project_id: int) -> dict:
        return await self.call("leantime.rpc.Projects.getProject", {"id": project_id})

    async def list_projects(self) -> list:
        return await self.call("leantime.rpc.Projects.getAll")

    async def create_project(self, name: str, details: Optional[str] = None, **kwargs) -> dict:
        params = {"name": name, **kwargs}
        if details:
            params["details"] = details
        return await self.call("leantime.rpc.Projects.addProject", params)

    async def get_ticket(self, ticket_id: int) -> dict:
        return await self.call("leantime.rpc.Tickets.Tickets.getTicket", {"id": ticket_id})

    async def list_tickets(
        self,
        project_id: Optional[int] = None,
        updated_since: Optional[str] = None,
    ) -> list:
        searchCriteria = {}
        if project_id:
            searchCriteria["currentProject"] = project_id
        params = {"searchCriteria": searchCriteria}
        result = await self.call("leantime.rpc.Tickets.Tickets.getAll", params)
        if updated_since and isinstance(result, list):
            # Prefer ticket.modified (last update); fall back to date when absent.
            return _filter_since(result, updated_since, ("modified", "date"))
        return result

    async def create_ticket(
        self,
        headline: str,
        project_id: int,
        user_id: int,
        date: Optional[str] = None,
        tags: Optional[str] = None,
        **kwargs,
    ) -> dict:
        from datetime import datetime

        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")

        values = {
            "headline": headline,
            "projectId": project_id,
            "userId": user_id,
            "date": date,
            **kwargs,
        }

        if tags is not None:
            values["tags"] = tags

        params = {"values": values}
        return await self.call("leantime.rpc.Tickets.Tickets.addTicket", params)

    async def update_ticket(self, ticket_id: int, project_id: int, **kwargs) -> dict:
        # Leantime updateTicket is a full replace (omitted description/editorId → "").
        # Use patchTicket so only provided fields change. project_id is kept for MCP
        # tool signature compatibility and is not sent on patch.
        _ = project_id
        values: dict[str, Any] = {}
        if "assignedTo" in kwargs:
            values["editorId"] = kwargs.pop("assignedTo")
        values.update(kwargs)
        if not values:
            raise ValueError("update_ticket requires at least one field to change")
        return await self.call(
            "leantime.rpc.Tickets.Tickets.patchTicket",
            {"id": ticket_id, "values": values},
        )

    async def get_status_labels(self) -> dict:
        return await self.call("leantime.rpc.Tickets.Tickets.getStatusLabels")

    async def get_user(self, user_id: int) -> dict:
        return await self.call("leantime.rpc.Users.getUser", {"id": user_id})

    async def list_users(self) -> list:
        return await self.call("leantime.rpc.Users.getAll")

    async def get_user_by_email(self, email: str) -> dict:
        return await self.call("leantime.rpc.Users.Users.getUserByEmail", {"email": email})

    async def add_comment(self, module: str, module_id: int, comment: str) -> dict:
        values: dict[str, Any] = {
            "text": comment,
            "father": 0,
        }

        if module == "ticket":
            values["ticketId"] = module_id
            ticket = await self.get_ticket(module_id)
            project_id = ticket.get("projectId") if isinstance(ticket, dict) else None
            if project_id:
                values["projectId"] = project_id

        params = {
            "values": values,
            "module": module,
            "entityId": module_id,
        }
        return await self.call("leantime.rpc.Comments.Comments.addComment", params)

    async def edit_comment(self, comment_id: int, comment: str) -> bool:
        params = {
            "id": comment_id,
            "values": {"text": comment},
        }
        return await self.call("leantime.rpc.Comments.Comments.editComment", params)

    async def delete_comment(self, comment_id: int) -> bool:
        return await self.call(
            "leantime.rpc.Comments.Comments.deleteComment",
            {"commentId": comment_id},
        )

    async def get_comments(
        self,
        module: str,
        module_id: int,
        since: Optional[str] = None,
        mentioned_user_id: Optional[int] = None,
    ) -> list:
        params = {
            "module": module,
            "entityId": module_id,
        }
        result = await self.call("leantime.rpc.Comments.Comments.getComments", params)
        if not isinstance(result, list):
            return result
        # Comments expose creation `date` (no reliable `modified` field).
        if since:
            result = _filter_since(result, since, ("date", "datetime", "modified"))
        if mentioned_user_id is not None:
            result = [
                c
                for c in result
                if isinstance(c, dict)
                and _mentions_user(str(c.get("text") or c.get("comment") or ""), mentioned_user_id)
            ]
        return result

    async def add_timesheet(self, user_id: int, ticket_id: int, hours: float, date: str, **kwargs) -> dict:
        params = {
            "userId": user_id,
            "ticketId": ticket_id,
            "hours": hours,
            "date": date,
            **kwargs,
        }
        return await self.call("leantime.rpc.Timesheets.addTime", params)

    async def get_timesheets(self, project_id: Optional[int] = None, user_id: Optional[int] = None) -> list:
        params = {}
        if project_id:
            params["projectId"] = project_id
        if user_id:
            params["userId"] = user_id
        return await self.call("leantime.rpc.Timesheets.getTimesheets", params)

    async def get_all_subtasks(self, ticket_id: int) -> list:
        params = {"ticketId": ticket_id}
        return await self.call("leantime.rpc.Tickets.Tickets.getAllSubtasks", params)

    async def upsert_subtask(
        self,
        parent_ticket_id: int,
        headline: str,
        date: Optional[str] = None,
        tags: Optional[str] = None,
        **kwargs,
    ) -> dict:
        from datetime import datetime

        if date is None:
            date = datetime.now().strftime("%Y-%m-%d")

        parent_ticket_data = await self.get_ticket(parent_ticket_id)

        if not parent_ticket_data:
            raise ValueError(f"Parent ticket with ID {parent_ticket_id} not found")

        project_id = parent_ticket_data.get("projectId")
        if not project_id:
            raise ValueError(f"Could not determine projectId from parent ticket {parent_ticket_id}")

        user_id = parent_ticket_data.get("userId")
        if not user_id:
            raise ValueError(f"Could not determine userId from parent ticket {parent_ticket_id}")

        milestone_id = parent_ticket_data.get("milestoneid")

        values = {
            "headline": headline,
            "type": "subtask",
            "projectId": project_id,
            "userId": user_id,
            "date": date,
            "dependingTicketId": parent_ticket_id,
            "milestoneid": milestone_id if milestone_id else "",
            **kwargs,
        }

        if tags is not None:
            values["tags"] = tags

        params = {"values": values}

        logger.info(
            "Creating subtask via addTicket: type=subtask, dependingTicketId=%s, milestoneid=%s",
            parent_ticket_id,
            milestone_id,
        )

        return await self.call("leantime.rpc.Tickets.Tickets.addTicket", params)

    async def list_ticket_files(self, ticket_id: int) -> list:
        return await self.call(
            "leantime.rpc.Files.Files.getFilesByModule",
            {"module": "ticket", "entityId": ticket_id},
        )

    async def delete_ticket_file(self, file_id: int) -> bool:
        return await self.call(
            "leantime.rpc.Files.Files.deleteFile",
            {"fileId": file_id},
        )

    async def upload_ticket_file(self, ticket_id: int, file_path: str) -> dict:
        from pathlib import Path

        path = Path(file_path)
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {file_path}")

        url = f"{self.base_url}/files/upload?module=ticket&moduleId={ticket_id}"
        headers = {"Authorization": f"Bearer {self.access_token}"}

        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            with path.open("rb") as handle:
                response = await client.post(
                    url,
                    headers=headers,
                    files={"file": (path.name, handle)},
                    timeout=60.0,
                )
            response.raise_for_status()
            data = response.json()

        if data.get("status") == "unauthorized":
            raise LeantimeAPIError(403, "Unauthorized")
        if data.get("status") == "error":
            raise LeantimeAPIError(-1, data.get("message", "Upload failed"))
        if not isinstance(data, dict) or "fileId" not in data:
            raise LeantimeAPIError(-1, "Unexpected upload response", data)

        return data

    async def download_ticket_file(self, enc_name: str) -> dict:
        import base64
        import re

        clean_name = re.sub(r"[^a-zA-Z0-9]+", "", enc_name)
        if not clean_name:
            raise ValueError("enc_name is required")

        url = f"{self.base_url}/files/get"
        headers = {"Authorization": f"Bearer {self.access_token}"}

        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            response = await client.get(
                url,
                params={"encName": clean_name},
                headers=headers,
                timeout=60.0,
            )
            response.raise_for_status()

        filename = None
        content_disposition = response.headers.get("content-disposition", "")
        if "filename=" in content_disposition:
            filename = content_disposition.split("filename=", 1)[1].strip().strip('"')

        content = response.content
        return {
            "encName": clean_name,
            "filename": filename,
            "content_type": response.headers.get("content-type"),
            "size": len(content),
            "content_base64": base64.b64encode(content).decode("ascii"),
        }
