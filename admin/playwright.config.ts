import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:3200",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    // A production build: `next dev` rewrites the tracked next-env.d.ts and
    // tsconfig.json, which made every e2e run leave the worktree dirty.
    command:
      "node ./node_modules/next/dist/bin/next build && node ./node_modules/next/dist/bin/next start -p 3200",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
