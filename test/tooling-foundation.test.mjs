import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("root package exposes the required P1-INF-01 commands", async () => {
  const packageJson = JSON.parse(await read("package.json"));

  assert.equal(packageJson.private, true);
  assert.match(packageJson.packageManager, /^pnpm@10\./);

  for (const script of [
    "dev",
    "test",
    "lint",
    "typecheck",
    "migrate",
    "seed",
  ]) {
    assert.equal(
      typeof packageJson.scripts[script],
      "string",
      `missing ${script} script`,
    );
  }
});

test("workspace includes every JavaScript package location", async () => {
  const workspace = await read("pnpm-workspace.yaml");

  for (const path of ["backend", "admin", "packages/*"]) {
    assert.match(
      workspace,
      new RegExp(`- ["']${path.replace("*", "\\*")}["']`),
    );
  }
});

test("local infrastructure declares the four required services", async () => {
  const compose = await read("infrastructure/docker-compose.yml");

  for (const service of ["postgres", "redis", "minio", "mailhog"]) {
    assert.match(compose, new RegExp(`^  ${service}:`, "m"));
  }

  assert.match(compose, /image: postgres:16/);
  assert.match(compose, /image: redis:7/);
});

test("environment template contains the locked configuration keys", async () => {
  const env = await read(".env.example");
  const required = [
    "NODE_ENV",
    "PORT",
    "API_BASE_URL",
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_KEY",
    "S3_SECRET",
    "S3_REGION",
    "DEFAULT_TIMEZONE",
    "DEFAULT_LOCALE",
  ];

  for (const key of required) {
    assert.match(env, new RegExp(`^${key}=`, "m"), `missing ${key}`);
  }
});

test("README documents a quick start in no more than three commands", async () => {
  const readme = await read("README.md");
  const marker = "<!-- quick-start-commands: 3 -->";

  assert.match(readme, new RegExp(marker));
  assert.match(readme, /corepack pnpm install/);
  assert.match(
    readme,
    /docker compose --env-file \.env\.example -f infrastructure\/docker-compose\.yml up -d/,
  );
  assert.match(
    readme,
    /corepack pnpm migrate && corepack pnpm seed && corepack pnpm dev/,
  );
});

test("backend foundation exposes the health route required by quick start", async () => {
  const healthController = await read(
    "backend/src/modules/health/health.controller.ts",
  );
  const main = await read("backend/src/main.ts");

  assert.match(healthController, /@Get\("health"\)/);
  assert.match(main, /await app\.listen\(/);
});
