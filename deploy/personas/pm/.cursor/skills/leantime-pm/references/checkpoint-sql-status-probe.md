# Leantime flow-checkpoint SQL status probe

Use this only as a bounded fallback during checkpoint watcher runs when `list_tickets` is huge/truncated and the JSON-RPC status probe is unavailable or rate-limited. Use MCP tools for comment mutations; SQL is for compact discovery/verification only.

Factory default dual-loop ids (`settings.status_board`): In Progress=4, Review=10, Deploying Test=11, QA=12, Deploying Prod=13.

## Kubernetes/MariaDB pattern

1. Confirm the Leantime MariaDB pod and DB env are available:
   `kubectl get pods -n sw-factory`
2. Run read-only SQL inside `leantime-mariadb-0` without printing secrets:
   `kubectl exec -n sw-factory leantime-mariadb-0 -- sh -c 'mysql -u"$MARIADB_USER" -p"$(cat $MARIADB_PASSWORD_FILE)" "$MARIADB_DATABASE" -e "SELECT status, COUNT(*) c FROM zp_tickets GROUP BY status ORDER BY status; SELECT id, projectId, headline, status, userId, editorId, dependingTicketId, type, modified FROM zp_tickets WHERE status IN (4,10,11,12,13) ORDER BY modified DESC;"'`
3. If top-level flow-active rows are empty, check visible subtasks with a grouped SQL query rather than probing every parent via JSON-RPC:
   `SELECT dependingTicketId, status, COUNT(*) c FROM zp_tickets WHERE dependingTicketId IS NOT NULL AND dependingTicketId <> 0 GROUP BY dependingTicketId, status ORDER BY dependingTicketId, status;`
4. Treat `status IN (4,10,11,12,13)` as the flow-active scope for `pm-checkpoint` (`gates: [flow_active]`). Skip stall/timebox comments when both top-level and subtask counts for those statuses are zero (misroute sweep may still run).

## Pitfalls

- Do not loop through every parent with `getAllSubtasks` via JSON-RPC during a watchdog run; it can trigger Leantime/API 429s and is unnecessary when the database can answer counts directly.
- Do not print database passwords or Leantime PATs. Use env/file expansion inside the pod and redact any diagnostic env output.
- SQL discovery does not replace MCP for adding comments. Once candidates are identified, use MCP `get_comments`/`add_comment` on the exact ticket IDs and enforce the 30-minute duplicate rule before mutating.
