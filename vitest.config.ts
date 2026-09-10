import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(
    path.join(__dirname, "backend/migrations"),
  );

  return {
    test: {
      include: ["backend/tests/**/*.test.ts"],
      setupFiles: ["./backend/tests/apply-migrations.ts"],
      poolOptions: {
          workers: {
            wrangler: { configPath: "./wrangler.jsonc" },
            isolatedStorage: false,
            miniflare: {
              bindings: {
                SESSION_SECRET: "test-session-secret-do-not-use-in-prod",
                TEST_MIGRATIONS: migrations,
              },
            },
          },
        },
    },
  };
});
