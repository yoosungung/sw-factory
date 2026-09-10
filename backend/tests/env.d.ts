/// <reference types="@cloudflare/workers-types" />
/// <reference types="vite/client" />

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    FILES: R2Bucket;
    ASSETS: Fetcher;
    SESSION_SECRET: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
