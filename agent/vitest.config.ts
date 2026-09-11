import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.join(__dirname),
  test: {
    include: ["gateway/tests/**/*.test.ts", "cursor/tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
  },
});
