import { DONE_PURGE_DAYS } from "./statuses";

async function deleteR2Keys(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (const key of keys) {
    await bucket.delete(key);
  }
}

/** Physically delete a done ticket and linked rows/objects. Does not delete parent/child tickets. */
async function purgeOneTicket(db: D1Database, bucket: R2Bucket, ticketId: string): Promise<void> {
  const files = await db
    .prepare(`SELECT r2_key FROM files WHERE entity_type = 'ticket' AND entity_id = ?`)
    .bind(ticketId)
    .all<{ r2_key: string }>();
  const pending = await db
    .prepare(`SELECT r2_key FROM pending_uploads WHERE ticket_id = ?`)
    .bind(ticketId)
    .all<{ r2_key: string }>();
  const keys = [...(files.results ?? []), ...(pending.results ?? [])]
    .map((r) => r.r2_key)
    .filter(Boolean);
  await deleteR2Keys(bucket, keys);

  await db.batch([
    db.prepare(`DELETE FROM files WHERE entity_type = 'ticket' AND entity_id = ?`).bind(ticketId),
    db.prepare(`DELETE FROM pending_uploads WHERE ticket_id = ?`).bind(ticketId),
    db.prepare(`DELETE FROM comments WHERE entity_type = 'ticket' AND entity_id = ?`).bind(ticketId),
    db.prepare(`DELETE FROM agent_event_log WHERE ticket_id = ?`).bind(ticketId),
    db.prepare(`DELETE FROM tickets WHERE id = ?`).bind(ticketId),
  ]);
}

/** Cron: category=done and updated_at older than DONE_PURGE_DAYS. */
export async function purgeExpiredDoneTickets(db: D1Database, bucket: R2Bucket): Promise<number> {
  const cutoff = new Date(Date.now() - DONE_PURGE_DAYS * 86400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT tickets.id AS id
       FROM tickets
       INNER JOIN project_statuses ps
         ON ps.project_id = tickets.project_id
        AND ps.key = tickets.status
        AND ps.category = 'done'
       WHERE tickets.updated_at < ?`,
    )
    .bind(cutoff)
    .all<{ id: string }>();

  let n = 0;
  for (const row of results ?? []) {
    await purgeOneTicket(db, bucket, row.id);
    n += 1;
  }
  return n;
}
