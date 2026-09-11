/// <reference types="@cloudflare/workers-types" />
/// <reference types="vite/client" />

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    FILES: R2Bucket;
    ASSETS: Fetcher;
    SESSION_SECRET: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    ADMIN_NAME?: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
