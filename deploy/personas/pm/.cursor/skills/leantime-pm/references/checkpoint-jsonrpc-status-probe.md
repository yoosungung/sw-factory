# Leantime flow-checkpoint JSON-RPC status probe

Use this reference when `list_tickets` is too large/truncated during a checkpoint watcher run and the task is only to identify dual-loop flow candidates before using MCP tools for comments/mutations.

Factory default ids: In Progress=4, Review=10, Deploying Test=11, QA=12, Deploying Prod=13.

## Pattern

1. Read Leantime credentials from the pm agent-runner environment (`LEANTIME_URL` and `LEANTIME_ACCESS_TOKEN`, also present on the Leantime MCP server env).
2. Call `{LEANTIME_URL}/api/jsonrpc` with `Authorization: Bearer <token>`.
3. Use `leantime.rpc.Tickets.Tickets.getAll` with params `{ "searchCriteria": {} }`.
4. Print only aggregate status counts and candidate rows with `status in {4,10,11,12,13}`.
5. If no top-level flow-active rows exist, do not assume hidden subtasks exist. Cross-check `subtaskCount > 0` parents and call `leantime.rpc.Tickets.Tickets.getAllSubtasks` for those parents only; count/check subtasks with those statuses.
6. Only after identifying candidates, fetch comments for those candidate IDs and enforce the 30-minute duplicate checkpoint rule, the 2h Deploy/QA stall SLA, and the post-health-check 1h → `@ta` assignee-runtime-check ladder (ARCHITECTURE §2.6 #14).

## Minimal fields to keep

For candidates, keep only:

`id`, `headline`, `projectId`, `projectName`, `status`, `type`, `userId`, `editorId`, `dependingTicketId`, `date`, `modified`, `commentCount`, `subtaskCount`.

## No-active verification

A no-op checkpoint run is stronger when it records both:

- top-level ticket status counts, and
- whether any parent had visible subtasks, plus flow-active subtask count.

If top-level and subtask flow-active counts are both zero, add no stall/timebox comments and report concise skip counts/reasons only (misroute sweep may still run).
