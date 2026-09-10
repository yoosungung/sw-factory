import { Hono } from "hono";
import type { AppVariables, Env } from "../env";
import { newId, nowIso } from "../lib/crypto";
import { requireAuth, requireProjectMember } from "../middleware/auth";

export const fileRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function ticketProjectId(db: D1Database, ticketId: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT project_id FROM tickets WHERE id = ?`)
    .bind(ticketId)
    .first<{ project_id: string }>();
  return row?.project_id ?? null;
}

/** Token-authenticated direct upload (no session cookie). */
fileRoutes.put("/files/direct-upload/:token", async (c) => {
  const token = c.req.param("token");
  const pending = await c.env.DB.prepare(
    `SELECT id, ticket_id, r2_key, mime, size, expires_at FROM pending_uploads WHERE id = ?`,
  )
    .bind(token)
    .first<{
      id: string;
      ticket_id: string;
      r2_key: string;
      mime: string;
      size: number;
      expires_at: string;
    }>();
  if (!pending) return c.json({ error: "not_found" }, 404);
  if (pending.expires_at < nowIso()) {
    await c.env.DB.prepare(`DELETE FROM pending_uploads WHERE id = ?`).bind(token).run();
    return c.json({ error: "expired" }, 400);
  }

  const bytes = await c.req.arrayBuffer();
  if (bytes.byteLength !== pending.size) {
    return c.json({ error: "size_mismatch" }, 400);
  }

  await c.env.FILES.put(pending.r2_key, bytes, {
    httpMetadata: { contentType: pending.mime },
  });

  return c.body(null, 204);
});

fileRoutes.use("/tickets/*", requireAuth);
fileRoutes.use("/files/:id", requireAuth);

fileRoutes.post("/tickets/:ticketId/files", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const projectId = await ticketProjectId(c.env.DB, ticketId);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return c.json({ error: "invalid_input" }, 400);

  const id = newId();
  const r2_key = `tickets/${ticketId}/${id}/${file.name}`;
  const bytes = await file.arrayBuffer();
  await c.env.FILES.put(r2_key, bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  const created_at = nowIso();
  const mime = file.type || "application/octet-stream";
  await c.env.DB.prepare(
    `INSERT INTO files (id, entity_type, entity_id, r2_key, filename, mime, size, uploaded_by, created_at)
     VALUES (?, 'ticket', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ticketId, r2_key, file.name, mime, bytes.byteLength, user.id, created_at)
    .run();

  return c.json(
    {
      file: {
        id,
        entity_type: "ticket",
        entity_id: ticketId,
        filename: file.name,
        mime,
        size: bytes.byteLength,
        uploaded_by: user.id,
        created_at,
      },
    },
    201,
  );
});

fileRoutes.post("/tickets/:ticketId/files/upload-url", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const projectId = await ticketProjectId(c.env.DB, ticketId);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{
    filename?: string;
    mime?: string;
    size?: number;
  }>();
  const filename = body.filename?.trim();
  const mime = body.mime?.trim() || "application/octet-stream";
  const size = body.size;
  if (!filename || typeof size !== "number" || !Number.isFinite(size) || size < 1) {
    return c.json({ error: "invalid_input" }, 400);
  }

  const id = newId();
  const r2_key = `tickets/${ticketId}/${id}/${filename}`;
  const created_at = nowIso();
  const expires_at = new Date(Date.now() + 3600_000).toISOString();

  await c.env.DB.prepare(
    `INSERT INTO pending_uploads (id, ticket_id, r2_key, filename, mime, size, uploaded_by, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, ticketId, r2_key, filename, mime, size, user.id, expires_at, created_at)
    .run();

  return c.json(
    {
      upload_url: `/api/files/direct-upload/${id}`,
      r2_key,
      expires_at,
    },
    201,
  );
});

fileRoutes.post("/tickets/:ticketId/files/confirm", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const projectId = await ticketProjectId(c.env.DB, ticketId);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const body = await c.req.json<{
    r2_key?: string;
    filename?: string;
    mime?: string;
    size?: number;
  }>();
  const r2_key = body.r2_key?.trim();
  if (!r2_key) return c.json({ error: "invalid_input" }, 400);

  const pending = await c.env.DB.prepare(
    `SELECT id, ticket_id, r2_key, filename, mime, size, uploaded_by
     FROM pending_uploads WHERE r2_key = ? AND ticket_id = ?`,
  )
    .bind(r2_key, ticketId)
    .first<{
      id: string;
      ticket_id: string;
      r2_key: string;
      filename: string;
      mime: string;
      size: number;
      uploaded_by: string;
    }>();
  if (!pending || pending.uploaded_by !== user.id) {
    return c.json({ error: "not_found" }, 404);
  }

  const obj = await c.env.FILES.head(pending.r2_key);
  if (!obj) return c.json({ error: "not_uploaded" }, 400);

  const id = newId();
  const created_at = nowIso();
  const filename = body.filename?.trim() || pending.filename;
  const mime = body.mime?.trim() || pending.mime;
  const size = body.size ?? pending.size;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO files (id, entity_type, entity_id, r2_key, filename, mime, size, uploaded_by, created_at)
       VALUES (?, 'ticket', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, ticketId, pending.r2_key, filename, mime, size, user.id, created_at),
    c.env.DB.prepare(`DELETE FROM pending_uploads WHERE id = ?`).bind(pending.id),
  ]);

  return c.json(
    {
      file: {
        id,
        entity_type: "ticket",
        entity_id: ticketId,
        filename,
        mime,
        size,
        uploaded_by: user.id,
        created_at,
      },
    },
    201,
  );
});

fileRoutes.get("/tickets/:ticketId/files", async (c) => {
  const user = c.get("user");
  const ticketId = c.req.param("ticketId");
  const projectId = await ticketProjectId(c.env.DB, ticketId);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const { results } = await c.env.DB.prepare(
    `SELECT id, entity_type, entity_id, filename, mime, size, uploaded_by, created_at
     FROM files WHERE entity_type = 'ticket' AND entity_id = ?
     ORDER BY created_at ASC`,
  )
    .bind(ticketId)
    .all();

  return c.json({ files: results });
});

fileRoutes.get("/files/:id", async (c) => {
  const user = c.get("user");
  const meta = await c.env.DB.prepare(
    `SELECT id, entity_id, r2_key, filename, mime, uploaded_by FROM files WHERE id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{
      id: string;
      entity_id: string;
      r2_key: string;
      filename: string;
      mime: string;
      uploaded_by: string;
    }>();
  if (!meta) return c.json({ error: "not_found" }, 404);

  const projectId = await ticketProjectId(c.env.DB, meta.entity_id);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);

  const obj = await c.env.FILES.get(meta.r2_key);
  if (!obj) return c.json({ error: "not_found" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": meta.mime,
      "Content-Disposition": `attachment; filename="${meta.filename}"`,
    },
  });
});

fileRoutes.delete("/files/:id", async (c) => {
  const user = c.get("user");
  const meta = await c.env.DB.prepare(
    `SELECT id, entity_id, r2_key, uploaded_by FROM files WHERE id = ?`,
  )
    .bind(c.req.param("id"))
    .first<{ id: string; entity_id: string; r2_key: string; uploaded_by: string }>();
  if (!meta) return c.json({ error: "not_found" }, 404);

  const projectId = await ticketProjectId(c.env.DB, meta.entity_id);
  if (!projectId) return c.json({ error: "not_found" }, 404);
  const role = await requireProjectMember(c.env.DB, projectId, user.id);
  if (!role) return c.json({ error: "forbidden" }, 403);
  if (meta.uploaded_by !== user.id && role !== "owner") {
    return c.json({ error: "forbidden" }, 403);
  }

  await c.env.FILES.delete(meta.r2_key);
  await c.env.DB.prepare(`DELETE FROM files WHERE id = ?`).bind(meta.id).run();
  return c.json({ ok: true });
});
