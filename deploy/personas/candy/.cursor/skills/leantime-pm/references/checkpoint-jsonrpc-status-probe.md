# Leantime 30-minute checkpoint JSON-RPC status probe

Use this reference when `list_tickets` is too large/truncated during a checkpoint watcher run and the task is only to identify active development candidates before using MCP tools for comments/mutations.

## Pattern

1. Read Leantime credentials from the candy agent-runner environment (`LEANTIME_URL` and `LEANTIME_ACCESS_TOKEN`, also present on the Leantime MCP server env).
2. Call `{LEANTIME_URL}/api/jsonrpc` with `Authorization: Bearer <token>`.
3. Use `leantime.rpc.Tickets.Tickets.getAll` with params `{ "searchCriteria": {} }`.
4. Print only aggregate status counts and candidate rows with `status == 4`.
5. If no top-level `status == 4` rows exist, do not assume hidden subtasks exist. Cross-check `subtaskCount > 0` parents and call `leantime.rpc.Tickets.Tickets.getAllSubtasks` for those parents only; count/check subtasks with `status == 4`.
6. Only after identifying candidates, fetch comments for those candidate IDs and enforce the 30-minute duplicate checkpoint rule.

## Minimal fields to keep

For candidates, keep only:

`id`, `headline`, `projectId`, `projectName`, `status`, `type`, `userId`, `editorId`, `dependingTicketId`, `date`, `modified`, `commentCount`, `subtaskCount`.

## No-active verification

A no-op checkpoint run is stronger when it records both:

- top-level ticket status counts, and
- whether any parent had visible subtasks, plus active subtask count.

If top-level active count and active subtask count are both zero, add no comments and report concise skip counts/reasons only.