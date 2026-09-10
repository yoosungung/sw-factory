import { Hono } from "hono";
import type { AppVariables, Env } from "./env";
import { nowIso } from "./lib/crypto";
import { authRoutes } from "./routes/auth";
import { clientRoutes } from "./routes/clients";
import { projectRoutes } from "./routes/projects";
import { ticketRoutes } from "./routes/tickets";
import { commentRoutes } from "./routes/comments";
import { fileRoutes } from "./routes/files";
import { userRoutes } from "./routes/users";
import { searchRoutes } from "./routes/search";

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

app.get("/api/health", (c) => c.json({ ok: true, service: "sw-factory-workers" }));

app.route("/api/auth", authRoutes);
app.route("/api/users", userRoutes);
app.route("/api/search", searchRoutes);
app.route("/api", ticketRoutes);
app.route("/api", commentRoutes);
app.route("/api", fileRoutes);
app.route("/api", clientRoutes);
app.route("/api", projectRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) {
    return c.json({ error: "not_found" }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export async function cleanupExpiredSessions(db: D1Database): Promise<number> {
  const result = await db
    .prepare(`DELETE FROM sessions WHERE expires_at < ?`)
    .bind(nowIso())
    .run();
  return result.meta.changes ?? 0;
}

const worker = {
  fetch: app.fetch,
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    await cleanupExpiredSessions(env.DB);
  },
};

export default worker;
