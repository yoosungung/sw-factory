# Leantime PM — pitfalls

Load when stuck, MCP returns false, or concurrent agents may race.

## Pitfalls

- Do not act as developer by default.
- Do not code just because repository access exists.
- Do not merge without test/deploy evidence.
- Do not merge on CI green alone without ticket Intent Pass (`intent: pass`); do not re-invent ticket intent from the PR description when intake Goal/AC exist.
- Do not bury decisions outside Leantime.
- Do not create giant vague tickets when subtasks are needed.
- Do not mark Done when only a PR exists but deployment is unverified.
- Do not mark Done on tenant_cd tickets without feature evidence (pr_url/merge_sha, test_*, qa pass, aa pass, prod_*).
- Do not mark a **parent Done** while any canonical open subtask remains (`get_all_subtasks`). Close/archive children first; Leantime does not auto-sync parent/child status.
- Do not decide major product tradeoffs without Eric.
- Do not self-assign or `@pm`-loop work that pm cannot execute with current credentials; capability gaps go to the owning specialist or Eric (`Waiting for Approval`), not `Blocked` drift.
- **Do not agent↔agent mention-storm** (`mention outcome` / `delegated_from` ping-pong). Lookback 2h or newest 30 comments: ≥8 factory-agent `@mention`s or ≥12 outcome/remediator seals without silence-reset → one terminal Approval+admin; no further agent `@mention`.
- Do not treat “file not in this workspace” as end of ownership — name the owning repo/owner and hand off.
- **Do not ACK-only on predecessor requests** (“will wire next”, remediator skip). Same turn: `set_blocked_by` → `get_ticket` verify marker. Soft prose/`<!-- blocked-by -->` in comments without MCP upsert is not registered.
- **Do not use `dependingTicketId` for FS blocked-by** — that field is parent/subtask only; misuse makes successors look like children and breaks parent Done gates.
- Be careful with Leantime `update_ticket`: some fields (for example tags) may not be accepted, and updating status can unintentionally clear description/priority depending on API behavior. On subtasks, `update_ticket` can also sever `dependingTicketId`/parent linkage and turn the item into an orphan task. Avoid `update_ticket` on live subtasks unless necessary; if used, immediately re-read `get_all_subtasks(parent)` and the ticket and repair/archive duplicates. Prefer `set_blocked_by` for FS deps so description patch preserves body HTML.
- `add_comment` module must be singular `ticket`, not `tickets`; the latter can return `false` without adding anything.
- If `get_ticket(active_id)` returns `false` or `get_comments(module="ticket", module_id=active_id)` returns unexpectedly empty for a newly assigned ticket, treat the Active ticket as unreadable and stop before implementation. Do not infer scope from the title alone, do not comment on nearby/older tickets, and do not proceed to git-ship against an unverified ticket. Attempt the required `add_comment` only on the exact Active ID; if it also returns `false`, re-read comments to verify no comment was stored and report the Leantime ID/environment blocker to the user.
- In watcher/concurrent-agent situations, ticket state and PR state can change between reads, comments, and final reporting. After any GitHub review/merge attempt and after every important `add_comment`, re-read the Active ticket and comments before finalizing. If the latest ticket status contradicts an earlier comment you just wrote, add a short correction on the same Active ticket rather than leaving stale closeout language. Do not mark or describe a ticket as Done unless the final `get_ticket(active_id)` read still shows Done and required evidence is present.
- Keep MCP comments/descriptions as simple, well-formed Leantime/Tiptap HTML. Use `<p>`, `<br>`, `<ul><li>`, `<b>`, and links as needed; do not rely on Markdown or raw newline rendering. Use the Leantime mention anchor for notifications.
- `upsert_subtask` may create task-like subtickets whose parent link is not visible via `get_all_subtasks` after later `update_ticket` calls. Verify parent/subtask visibility after creating or updating subtasks, and archive accidental duplicates with a clear canonical pointer.
- Do not mark newly created subtasks Done. In this Leantime MCP, subtask status values can be surprising: textual status names like `New` may be interpreted as Done, while numeric strings such as `"3"` and `"4"` worked for New/In Progress in testing. After creating subtasks, immediately re-read them and ensure implementation subtasks are `New` (`status=3`) or `In Progress` (`status=4`) only when work has actually started. `Done` (`status=0`) requires PR/test/deploy evidence in comments.
- In concurrent watcher runs, do not treat your own just-written comment as the final state if newer comments appeared while you were working. Re-read the newest ticket comments after every mutation and reconcile duplicate PRs/status changes before finalizing. If another handler has recorded an unresolved deployment/smoke blocker, keep the ticket `In Progress` or `Blocked` even if a code PR was merged.
- After approving or merging a PR, immediately re-read both GitHub PR state and the active Leantime comments before adding a follow-up correction/status comment. Another handler may have already merged the PR, dispatched a recovery workflow, retagged images, or recorded stronger evidence in the few seconds between your approval and your finalization. Base the next comment/status on the newest evidence; avoid posting stale “remaining action” commands if a newer comment already records that equivalent unblock/retag step succeeded. If deploy/rollout smoke is still missing, say only that specific evidence remains and keep the ticket `In Progress`.
