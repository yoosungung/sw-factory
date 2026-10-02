import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ensureSeedAdmin, resetSeedAdminGate } from "../src/lib/seed-admin";

describe("ensureSeedAdmin gate", () => {
  it("is idempotent after the first successful ensure in an isolate", async () => {
    resetSeedAdminGate();
    await env.DB.prepare(`UPDATE users SET is_admin = 0`).run();

    const email = `gate_${crypto.randomUUID()}@example.com`;
    const adminEnv = {
      ...env,
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: "password123",
      ADMIN_NAME: "GateAdmin",
    };

    try {
      await ensureSeedAdmin(adminEnv);
      await ensureSeedAdmin(adminEnv);

      const row = await env.DB.prepare(`SELECT id, is_admin FROM users WHERE email = ?`)
        .bind(email)
        .first<{ id: string; is_admin: number }>();
      expect(row?.is_admin).toBe(1);
    } finally {
      resetSeedAdminGate();
    }
  });
});
