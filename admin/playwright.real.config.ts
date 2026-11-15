import { defineConfig } from "@playwright/test";

/**
 * The admin console against a real local API and database (no mocked
 * routes). Needs DATABASE_URL and REDIS_URL for a migrated, seeded test
 * database, the backend built (corepack pnpm --filter @kaj/backend build)
 * and the dev-seed admin in ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD /
 * ADMIN_SEED_TOTP_SECRET (CI loads them from .env.example).
 */
const API_PORT = Number(process.env.KAJ_E2E_API_PORT ?? 3311);
const ADMIN_PORT = Number(process.env.KAJ_E2E_ADMIN_PORT ?? 3201);

export default defineConfig({
  testDir: "./tests/real",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  timeout: 60_000,
  globalSetup: "./tests/real/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${ADMIN_PORT}`,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node ../backend/dist/main.js",
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...(process.env as Record<string, string>),
        NODE_ENV: "test",
        PORT: String(API_PORT),
        API_BASE_URL: `http://127.0.0.1:${API_PORT}`,
        RUN_SCHEDULERS: "false",
      },
    },
    {
      // A production build: `next dev` rewrites tracked files.
      command: `node ./node_modules/next/dist/bin/next build && node ./node_modules/next/dist/bin/next start -p ${ADMIN_PORT}`,
      url: `http://127.0.0.1:${ADMIN_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        ...(process.env as Record<string, string>),
        KAJ_API_URL: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
});
