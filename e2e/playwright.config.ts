import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const browsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), "Library/Caches/ms-playwright");
const chromiumExe = path.join(
  browsersPath,
  "chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
);
const launchOptions = fs.existsSync(chromiumExe)
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || chromiumExe }
  : process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : undefined;

/**
 * E2E uses Playwright Chromium (bundled / CfT), not system Chrome.
 * See DESIGN.md for install when CDN is blocked.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    ...devices["Desktop Chrome"],
    channel: undefined,
    launchOptions,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run db:migrate:local && npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
