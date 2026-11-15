import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const databaseDescribe =
  process.env.MIGRATIONS_DATABASE_E2E === "1" ? describe : describe.skip;

const MIGRATIONS = join(__dirname, "..", "prisma", "migrations");
const PRISMA = join(__dirname, "..", "node_modules", ".bin", "prisma");

/** Migrations that ship a hand-written down.sql, newest first. */
function reversible() {
  return readdirSync(MIGRATIONS)
    .filter((name) => existsSync(join(MIGRATIONS, name, "down.sql")))
    .sort()
    .reverse();
}

/** Splits a SQL file into statements (no functions/DO blocks in down.sql). */
function statements(sql: string) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

/**
 * Every down.sql really undoes its migration: on a throwaway database,
 * deploy all migrations, run the down files newest first, check the objects
 * are gone, then deploy again (the up migrations still apply cleanly).
 */
databaseDescribe("migration rollback scripts", () => {
  const name = `kaj_rollback_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  // Built lazily: describe bodies run even when the suite is skipped, and
  // a plain unit run has no DATABASE_URL.
  let baseUrl: URL;
  let url: URL;
  let admin: PrismaClient;
  let db: PrismaClient;

  const deploy = () =>
    execFileSync(PRISMA, ["migrate", "deploy"], {
      cwd: join(__dirname, ".."),
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe",
    });

  beforeAll(async () => {
    baseUrl = new URL(process.env.DATABASE_URL!);
    url = new URL(baseUrl);
    url.pathname = `/${name}`;
    admin = new PrismaClient({ datasourceUrl: baseUrl.toString() });
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    db = new PrismaClient({ datasourceUrl: url.toString() });
  }, 60_000);

  afterAll(async () => {
    await db?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await admin?.$disconnect();
  }, 60_000);

  const indexExists = async (index: string) =>
    (
      await db.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT count(*) AS n FROM pg_indexes WHERE indexname = ${index}`
    )[0]!.n > 0n;
  const constraintExists = async (constraint: string) =>
    (
      await db.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT count(*) AS n FROM pg_constraint WHERE conname = ${constraint}`
    )[0]!.n > 0n;

  it("rolls back and re-applies the P0 data-hygiene migrations", async () => {
    deploy();
    expect(await indexExists("reports_reporter_user_id_created_at_idx")).toBe(
      true,
    );
    expect(await constraintExists("reviews_rating_range_check")).toBe(true);
    await expect(
      db.$executeRawUnsafe(
        `INSERT INTO feature_flags (key, is_enabled, rollout_percent, updated_at) VALUES ('rollback-test', false, 101, now())`,
      ),
    ).rejects.toThrow(/feature_flags_rollout_percent_range_check/);

    const downs = reversible();
    expect(downs).toEqual(
      expect.arrayContaining([
        "20261116100100_validate_check_constraints",
        "20261116100000_align_drift_and_fk_indexes",
      ]),
    );
    for (const migration of downs) {
      for (const statement of statements(
        readFileSync(join(MIGRATIONS, migration, "down.sql"), "utf8"),
      ))
        await db.$executeRawUnsafe(statement);
      await db.$executeRawUnsafe(
        `DELETE FROM _prisma_migrations WHERE migration_name = $1`,
        migration,
      );
    }

    expect(await indexExists("reports_reporter_user_id_created_at_idx")).toBe(
      false,
    );
    expect(await constraintExists("reviews_rating_range_check")).toBe(false);
    expect(
      await indexExists(
        "risk_identity_observations_kind_value_hash_last_observed_idx",
      ),
    ).toBe(true);
    const [column] = await db.$queryRaw<Array<{ column_default: string }>>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'conversations' AND column_name = 'updated_at'`;
    expect(column!.column_default).toMatch(/CURRENT_TIMESTAMP/i);

    // The forward migrations apply again on the rolled-back database.
    deploy();
    expect(await indexExists("reports_reporter_user_id_created_at_idx")).toBe(
      true,
    );
    expect(await constraintExists("reviews_rating_range_check")).toBe(true);
  }, 180_000);
});
