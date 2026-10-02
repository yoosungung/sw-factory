import { newId, nowIso } from "./crypto";
import { appendAgentEvent } from "./agent-events";
import { parseBlockedByIds, stripBlockedByMarker } from "./blocked-by-marker";

/** When last FS blocker clears and status is blocked → this key (ARCHITECTURE). */
export const UNBLOCK_STATUS = "in_progress";

export type DepTicketRef = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  milestone_id: string | null;
  assignee_id: string | null;
  version: number;
  description: string;
};

export async function listBlockerIds(
  db: D1Database,
  successorId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT blocker_id FROM ticket_dependencies WHERE successor_id = ? ORDER BY blocker_id`,
    )
    .bind(successorId)
    .all<{ blocker_id: string }>();
  return (results ?? []).map((r) => r.blocker_id);
}

/** Dual-read: table ∪ soft marker (one-release migrate window). */
export async function resolveBlockerIds(
  db: D1Database,
  successorId: string,
  description: string,
): Promise<string[]> {
  const fromTable = await listBlockerIds(db, successorId);
  const fromMarker = parseBlockedByIds(description);
  return [...new Set([...fromTable, ...fromMarker])];
}

async function loadTicketRef(
  db: D1Database,
  id: string,
): Promise<DepTicketRef | null> {
  return db
    .prepare(
      `SELECT id, title, status, project_id, milestone_id, assignee_id, version, description
       FROM tickets WHERE id = ?`,
    )
    .bind(id)
    .first<DepTicketRef>();
}

async function loadTicketRefsByIds(
  db: D1Database,
  ids: string[],
): Promise<Map<string, DepTicketRef>> {
  const map = new Map<string, DepTicketRef>();
  if (ids.length === 0) return map;
  const ph = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, title, status, project_id, milestone_id, assignee_id, version, description
       FROM tickets WHERE id IN (${ph})`,
    )
    .bind(...ids)
    .all<DepTicketRef>();
  for (const row of results ?? []) map.set(row.id, row);
  return map;
}

function reachesInAdj(
  adj: Map<string, string[]>,
  fromId: string,
  targetId: string,
): boolean {
  if (fromId === targetId) return true;
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) ?? []) {
      if (next === targetId) return true;
      if (!seen.has(next)) stack.push(next);
    }
  }
  return false;
}

/** True if `fromId` can reach `targetId` following blocker→successor edges. */
export async function reachesViaDependencies(
  db: D1Database,
  fromId: string,
  targetId: string,
): Promise<boolean> {
  if (fromId === targetId) return true;
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const { results } = await db
      .prepare(`SELECT successor_id FROM ticket_dependencies WHERE blocker_id = ?`)
      .bind(cur)
      .all<{ successor_id: string }>();
    for (const row of results ?? []) {
      if (row.successor_id === targetId) return true;
      if (!seen.has(row.successor_id)) stack.push(row.successor_id);
    }
  }
  return false;
}

export type SetBlockersResult =
  | { ok: true; blocker_ids: string[] }
  | { ok: false; error: string };

export async function setBlockers(
  db: D1Database,
  successor: DepTicketRef,
  blockerIds: string[],
  actorUserId: string,
): Promise<SetBlockersResult> {
  const ids = [...new Set(blockerIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.includes(successor.id)) {
    return { ok: false, error: "dependency_cycle" };
  }

  if (ids.length > 0) {
    const byId = await loadTicketRefsByIds(db, ids);
    for (const blockerId of ids) {
      const blocker = byId.get(blockerId);
      if (!blocker || blocker.project_id !== successor.project_id) {
        return { ok: false, error: "invalid_blocker" };
      }
      if (
        successor.milestone_id === blockerId ||
        blocker.milestone_id === successor.id
      ) {
        return { ok: false, error: "parent_not_fs" };
      }
    }

    const { results: edgeRows } = await db
      .prepare(
        `SELECT d.blocker_id, d.successor_id
         FROM ticket_dependencies d
         JOIN tickets t ON t.id = d.successor_id
         WHERE t.project_id = ?`,
      )
      .bind(successor.project_id)
      .all<{ blocker_id: string; successor_id: string }>();
    const adj = new Map<string, string[]>();
    for (const e of edgeRows ?? []) {
      const list = adj.get(e.blocker_id) ?? [];
      list.push(e.successor_id);
      adj.set(e.blocker_id, list);
    }

    for (const blockerId of ids) {
      if (reachesInAdj(adj, successor.id, blockerId)) {
        return { ok: false, error: "dependency_cycle" };
      }
    }
  }

  const ts = nowIso();
  const stmts: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM ticket_dependencies WHERE successor_id = ?`).bind(successor.id),
    ...ids.map((blockerId) =>
      db
        .prepare(
          `INSERT INTO ticket_dependencies (successor_id, blocker_id, created_at, created_by)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(successor.id, blockerId, ts, actorUserId),
    ),
  ];

  const stripped = stripBlockedByMarker(successor.description);
  if (stripped !== successor.description) {
    stmts.push(
      db
        .prepare(
          `UPDATE tickets SET description = ?, version = version + 1, updated_at = ? WHERE id = ?`,
        )
        .bind(stripped, ts, successor.id),
    );
  }

  await db.batch(stmts);

  return { ok: true, blocker_ids: ids };
}

export type DepSummary = { id: string; title: string; status: string };

export async function listDependencyView(
  db: D1Database,
  ticketId: string,
): Promise<{
  blocker_ids: string[];
  blockers: DepSummary[];
  blocking: DepSummary[];
}> {
  const ticket = await loadTicketRef(db, ticketId);
  if (!ticket) {
    return { blocker_ids: [], blockers: [], blocking: [] };
  }
  const blocker_ids = await resolveBlockerIds(db, ticketId, ticket.description);

  let blockers: DepSummary[] = [];
  if (blocker_ids.length > 0) {
    const ph = blocker_ids.map(() => "?").join(",");
    const { results } = await db
      .prepare(
        `SELECT id, title, status FROM tickets WHERE id IN (${ph}) ORDER BY id`,
      )
      .bind(...blocker_ids)
      .all<DepSummary>();
    blockers = results ?? [];
  }

  const { results: blockingRows } = await db
    .prepare(
      `SELECT t.id, t.title, t.status
       FROM ticket_dependencies d
       JOIN tickets t ON t.id = d.successor_id
       WHERE d.blocker_id = ?
       ORDER BY t.id`,
    )
    .bind(ticketId)
    .all<DepSummary>();

  return {
    blocker_ids,
    blockers,
    blocking: blockingRows ?? [],
  };
}

async function isDoneCategory(
  db: D1Database,
  projectId: string,
  statusKey: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT category FROM project_statuses WHERE project_id = ? AND key = ?`,
    )
    .bind(projectId, statusKey)
    .first<{ category: string }>();
  return row?.category === "done";
}

/**
 * After a ticket reaches done: clear FS edges where it is blocker;
 * unblock successors that have no remaining blockers.
 */
export async function onBlockerReachedDone(
  db: D1Database,
  blocker: DepTicketRef,
  actorUserId: string,
): Promise<void> {
  const done = await isDoneCategory(db, blocker.project_id, blocker.status);
  if (!done) return;

  const { results: edges } = await db
    .prepare(
      `SELECT successor_id FROM ticket_dependencies WHERE blocker_id = ?`,
    )
    .bind(blocker.id)
    .all<{ successor_id: string }>();

  if (!edges?.length) return;

  await db
    .prepare(`DELETE FROM ticket_dependencies WHERE blocker_id = ?`)
    .bind(blocker.id)
    .run();

  const successorIds = edges.map((e) => e.successor_id);
  const successors = await loadTicketRefsByIds(db, successorIds);

  const remainingBySuccessor = new Map<string, string[]>();
  if (successorIds.length > 0) {
    const ph = successorIds.map(() => "?").join(",");
    const { results: remainRows } = await db
      .prepare(
        `SELECT successor_id, blocker_id FROM ticket_dependencies
         WHERE successor_id IN (${ph})`,
      )
      .bind(...successorIds)
      .all<{ successor_id: string; blocker_id: string }>();
    for (const row of remainRows ?? []) {
      const list = remainingBySuccessor.get(row.successor_id) ?? [];
      list.push(row.blocker_id);
      remainingBySuccessor.set(row.successor_id, list);
    }
  }

  const at = nowIso();
  const stmts: D1PreparedStatement[] = [];
  const eventInputs: Parameters<typeof appendAgentEvent>[1][] = [];

  for (const successor_id of successorIds) {
    const successor = successors.get(successor_id);
    if (!successor) continue;

    const priorMarker = parseBlockedByIds(successor.description);
    const markerIds = priorMarker.filter((id) => id !== blocker.id);
    let description = successor.description;
    if (priorMarker.includes(blocker.id)) {
      description =
        markerIds.length === 0
          ? stripBlockedByMarker(successor.description)
          : successor.description.replace(
              /<!--\s*blocked-by:[^>]*-->/i,
              `<!-- blocked-by:${markerIds.join(",")} -->`,
            );
    }

    const remainingTable = remainingBySuccessor.get(successor_id) ?? [];
    const remaining = [...new Set([...remainingTable, ...markerIds])];
    const shouldUnblock =
      remaining.length === 0 && successor.status === "blocked";
    const nextStatus = shouldUnblock ? UNBLOCK_STATUS : successor.status;
    const changedFields: string[] = [];
    if (description !== successor.description) changedFields.push("description");
    if (shouldUnblock) changedFields.push("status");

    if (changedFields.length > 0) {
      const nextVersion = successor.version + 1;
      stmts.push(
        db
          .prepare(
            `UPDATE tickets SET status = ?, description = ?, version = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(nextStatus, description, nextVersion, at, successor.id),
      );
      if (shouldUnblock) {
        stmts.push(
          db
            .prepare(
              `INSERT INTO ticket_activities (id, ticket_id, actor_id, field, old_val, new_val, at)
               VALUES (?, ?, ?, 'status', ?, ?, ?)`,
            )
            .bind(
              newId(),
              successor.id,
              actorUserId,
              successor.status,
              nextStatus,
              at,
            ),
        );
      }
    }

    eventInputs.push({
      event_type: "ticket_updated",
      ticket_id: successor.id,
      project_id: successor.project_id,
      actor_user_id: actorUserId,
      assignee_user_id: successor.assignee_id,
      at,
      payload: {
        dependency_cleared: true,
        unblocked_from: [blocker.id],
        ...(changedFields.length ? { changed_fields: changedFields } : {}),
      },
    });
  }

  if (stmts.length > 0) {
    await db.batch(stmts);
  }
  for (const input of eventInputs) {
    await appendAgentEvent(db, input);
  }
}

