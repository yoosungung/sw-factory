# SPDX-FileCopyrightText: 2025 Daniel Eder
#
# SPDX-License-Identifier: MIT

"""Leantime MCP Server - Main server implementation."""

import os
import sys
import json
import logging
from typing import Any
from dotenv import load_dotenv

from fastmcp import FastMCP

from leantime_mcp.client import LeantimeClient, LeantimeAPIError

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize the FastMCP server
app = FastMCP("leantime-mcp")

# Global Leantime client instance
leantime_client: LeantimeClient = None


def get_client() -> LeantimeClient:
    """Get or create the Leantime client instance."""
    global leantime_client
    
    if leantime_client is None:
        # Get configuration from environment
        leantime_url = os.getenv("LEANTIME_URL")
        leantime_access_token = os.getenv("LEANTIME_ACCESS_TOKEN")

        if not leantime_url:
            raise ValueError(
                "LEANTIME_URL environment variable is required. "
                "Please set it in your .env file or environment."
            )

        if not leantime_access_token:
            raise ValueError(
                "LEANTIME_ACCESS_TOKEN environment variable is required. "
                "Use a Personal Access Token from Profile → Personal Access Tokens."
            )

        verify_ssl = os.getenv("LEANTIME_SSL_VERIFY", "true").lower() not in {
            "0",
            "false",
            "no",
        }
        leantime_client = LeantimeClient(
            leantime_url,
            leantime_access_token,
            verify_ssl=verify_ssl,
        )
        logger.info(
            "Initialized Leantime client for %s (Bearer PAT, ssl_verify=%s)",
            leantime_url,
            verify_ssl,
        )
    
    return leantime_client


# Tool functions will be defined below


@app.tool()
async def get_project(project_id: int) -> str:
    """Get details of a specific project by ID."""
    client = get_client()
    result = await client.get_project(project_id)
    return json.dumps(result, indent=2)


@app.tool()
async def list_projects() -> str:
    """List all projects accessible to the user."""
    client = get_client()
    result = await client.list_projects()
    return json.dumps(result, indent=2)


@app.tool()
async def create_project(name: str, details: str = None, clientId: int = None) -> str:
    """Create a new project."""
    client = get_client()
    result = await client.create_project(name=name, details=details, clientId=clientId)
    return json.dumps(result, indent=2)


@app.tool()
async def get_ticket(ticket_id: int) -> str:
    """Get details of a specific ticket by ID."""
    client = get_client()
    result = await client.get_ticket(ticket_id)
    return json.dumps(result, indent=2)


@app.tool()
async def list_tickets(project_id: int = None, updated_since: str = None) -> str:
    """List tickets, optionally filtered by project ID and last-updated time.

    updated_since: ISO date/datetime (e.g. 2026-07-18). Keeps tickets whose
    `modified` (fallback: `date`) is on or after that instant. Filtering is
    client-side; Leantime JSON-RPC has no modifiedAfter for tickets.
    """
    client = get_client()
    result = await client.list_tickets(
        project_id=project_id, updated_since=updated_since
    )
    return json.dumps(result, indent=2)


@app.tool()
async def create_ticket(headline: str, project_id: int, user_id: int, date: str = None, 
                       description: str = None, status: str = None, priority: str = None,
                       assignedTo: str = None, tags: str = None) -> str:
    """Create a new ticket."""
    client = get_client()
    result = await client.create_ticket(
        headline=headline, project_id=project_id, user_id=user_id, date=date,
        description=description, status=status, priority=priority,
        assignedTo=assignedTo, tags=tags
    )
    return json.dumps(result, indent=2)


@app.tool()
async def update_ticket(ticket_id: int, project_id: int, headline: str = None, description: str = None, 
                       status: int = None, priority: str = None, assignedTo: int = None) -> str:
    """Update an existing ticket."""
    client = get_client()
    # Build kwargs from non-None parameters
    kwargs = {}
    if headline is not None:
        kwargs['headline'] = headline
    if description is not None:
        kwargs['description'] = description
    if status is not None:
        kwargs['status'] = status
    if priority is not None:
        kwargs['priority'] = priority
    if assignedTo is not None:
        kwargs['assignedTo'] = assignedTo
    
    result = await client.update_ticket(ticket_id, project_id, **kwargs)
    return json.dumps(result, indent=2)


@app.tool()
async def get_status_labels() -> str:
    """Get available status labels."""
    client = get_client()
    result = await client.get_status_labels()
    return json.dumps(result, indent=2)


@app.tool()
async def get_user(user_id: int) -> str:
    """Get details of a specific user by ID."""
    client = get_client()
    result = await client.get_user(user_id)
    return json.dumps(result, indent=2)


@app.tool()
async def list_users() -> str:
    """List all users."""
    client = get_client()
    result = await client.list_users()
    return json.dumps(result, indent=2)


@app.tool()
async def add_comment(module: str, module_id: int, comment: str) -> str:
    """Add a comment to a module (ticket, project, etc.)."""
    client = get_client()
    result = await client.add_comment(module=module, module_id=module_id, comment=comment)
    return json.dumps(result, indent=2)


@app.tool()
async def edit_comment(comment_id: int, comment: str) -> str:
    """Edit an existing comment by id (author or comments.moderate)."""
    client = get_client()
    result = await client.edit_comment(comment_id, comment)
    return json.dumps(result, indent=2)


@app.tool()
async def delete_comment(comment_id: int) -> str:
    """Delete a comment by id (author or comments.moderate)."""
    client = get_client()
    result = await client.delete_comment(comment_id)
    return json.dumps(result, indent=2)


@app.tool()
async def get_comments(
    module: str,
    module_id: int,
    since: str = None,
    mentioned_user_id: int = None,
) -> str:
    """Get comments for a module (ticket, project, etc.).

    since: ISO date/datetime; keep comments with `date` on/after that instant
    (comments have no reliable `modified` field).
    mentioned_user_id: keep only comments whose HTML mentions that user via
    `data-tagged-user-id` (plain `@name` text does not count).
    """
    client = get_client()
    result = await client.get_comments(
        module=module,
        module_id=module_id,
        since=since,
        mentioned_user_id=mentioned_user_id,
    )
    return json.dumps(result, indent=2)


@app.tool()
async def add_timesheet(user_id: int, ticket_id: int, hours: float, date: str, description: str = None) -> str:
    """Add a timesheet entry."""
    client = get_client()
    result = await client.add_timesheet(
        user_id=user_id, ticket_id=ticket_id, hours=hours, date=date, description=description
    )
    return json.dumps(result, indent=2)


@app.tool()
async def get_timesheets(project_id: int = None, user_id: int = None) -> str:
    """Get timesheets, optionally filtered by project or user."""
    client = get_client()
    result = await client.get_timesheets(project_id=project_id, user_id=user_id)
    return json.dumps(result, indent=2)


@app.tool()
async def get_all_subtasks(ticket_id: int) -> str:
    """Get all subtasks for a ticket."""
    client = get_client()
    result = await client.get_all_subtasks(ticket_id)
    return json.dumps(result, indent=2)


@app.tool()
async def upsert_subtask(parent_ticket: int, headline: str,
                        date: str = None, description: str = None, status: str = None,
                        priority: str = None, assignedTo: str = None, tags: str = None) -> str:
    """Create or update a subtask."""
    client = get_client()
    result = await client.upsert_subtask(
        parent_ticket_id=parent_ticket, headline=headline,
        date=date, description=description, status=status, priority=priority,
        assignedTo=assignedTo, tags=tags
    )
    return json.dumps(result, indent=2)


@app.tool()
async def list_ticket_files(ticket_id: int) -> str:
    """List files attached to a ticket."""
    client = get_client()
    result = await client.list_ticket_files(ticket_id)
    return json.dumps(result, indent=2)


@app.tool()
async def upload_ticket_file(ticket_id: int, file_path: str) -> str:
    """Upload a local file and attach it to a ticket."""
    client = get_client()
    result = await client.upload_ticket_file(ticket_id, file_path)
    return json.dumps(result, indent=2)


@app.tool()
async def download_ticket_file(enc_name: str) -> str:
    """Download a ticket file by encName (from list_ticket_files). Returns base64 content."""
    client = get_client()
    result = await client.download_ticket_file(enc_name)
    return json.dumps(result, indent=2)


@app.tool()
async def delete_ticket_file(file_id: int) -> str:
    """Delete a ticket file by file id (from list_ticket_files)."""
    client = get_client()
    result = await client.delete_ticket_file(file_id)
    return json.dumps(result, indent=2)


def main():
    """Main entry point for the MCP server."""
    app.run()


if __name__ == "__main__":
    main()
