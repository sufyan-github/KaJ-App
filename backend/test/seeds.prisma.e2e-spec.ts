import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

import {
  businessCategories,
  categories,
  loadReferenceData,
  pilotAreas,
  skills,
  thanas,
} from "../prisma/reference-data";

const databaseDescribe =
  process.env.MIGRATIONS_DATABASE_E2E === "1" ? describe : describe.skip;

const BACKEND = join(__dirname, "..");
const BIN = join(BACKEND, "node_modules", ".bin");
const AREA_COUNT = Object.values(pilotAreas).reduce(
  (sum, areas) => sum + areas.length,
  0,
);
const LOCATION_COUNT = 1 + thanas.length + AREA_COUNT;

/**
 * On a fresh throwaway database: the production loader, the development
 * seed and the demo seed each run twice, and the second run changes nothing.
 */
databaseDescribe("seeds and the reference-data loader", () => {
  const name = `kaj_seed_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  // Built lazily: describe bodies run even when the suite is skipped, and
  // a plain unit run has no DATABASE_URL.
  let baseUrl: URL;
  let url: URL;
  let admin: PrismaClient;
  let db: PrismaClient;

  const run = (bin: string, args: string[], env: Record<string, string> = {}) =>
    execFileSync(join(BIN, bin), args, {
      cwd: BACKEND,
      env: { ...process.env, DATABASE_URL: url.toString(), ...env },
      stdio: "pipe",
    }).toString();

  /** Row counts and last-change times: equal snapshots mean "no change". */
  async function snapshot() {
    const [cats, skillRows, locations, users, flags] = await Promise.all([
      db.category.findMany({ select: { id: true, updated_at: true } }),
      db.skill.findMany({ select: { id: true, updated_at: true } }),
      db.location.findMany({ select: { id: true, updated_at: true } }),
      db.user.count(),
      db.featureFlag.count(),
    ]);
    const stamp = (rows: Array<{ id: string; updated_at: Date }>) =>
      rows
        .map((row) => `${row.id}@${row.updated_at.toISOString()}`)
        .sort()
        .join(",");
    return {
      categories: cats.length,
      skills: skillRows.length,
      locations: locations.length,
      users,
      flags,
      stamps: [stamp(cats), stamp(skillRows), stamp(locations)].join("|"),
    };
  }

  beforeAll(async () => {
    baseUrl = new URL(process.env.DATABASE_URL!);
    url = new URL(baseUrl);
    url.pathname = `/${name}`;
    admin = new PrismaClient({ datasourceUrl: baseUrl.toString() });
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    run("prisma", ["migrate", "deploy"]);
    db = new PrismaClient({ datasourceUrl: url.toString() });
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    await admin?.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    await admin?.$disconnect();
  }, 60_000);

  it("loads reference data on an empty database, and a rerun changes nothing", async () => {
    // A dry run writes nothing.
    const dry = run("tsx", ["prisma/reference-data-load.ts", "--dry-run"], {
      NODE_ENV: "production",
    });
    expect(dry).toContain(
      `would create: ${categories.length} categories, ${skills.length} skills, ${LOCATION_COUNT} locations, ${businessCategories.length} business sectors`,
    );
    expect((await snapshot()).categories).toBe(0);

    // The CLI works with NODE_ENV=production and touches nothing but the
    // catalogue and locations.
    run("tsx", ["prisma/reference-data-load.ts"], { NODE_ENV: "production" });
    const first = await snapshot();
    expect(first).toMatchObject({
      categories: categories.length,
      skills: skills.length,
      locations: LOCATION_COUNT,
      users: 0,
      flags: 0,
    });

    const again = await loadReferenceData(db);
    expect(again.created).toEqual({
      categories: 0,
      skills: 0,
      locations: 0,
      businessCategories: 0,
    });
    expect(again.existing).toEqual({
      categories: categories.length,
      skills: skills.length,
      locations: LOCATION_COUNT,
      businessCategories: businessCategories.length,
    });
    expect(await snapshot()).toEqual(first);
  }, 120_000);

  it("never overwrites an admin's change to reference data", async () => {
    await db.category.update({
      where: { slug: "home-services" },
      data: { name_en: "Home help (edited)", sort_order: 99 },
    });
    await db.skill.update({
      where: { slug: "cooking" },
      data: { is_active: false },
    });
    const before = await snapshot();
    await loadReferenceData(db);
    expect(await snapshot()).toEqual(before);
    expect(
      await db.category.findUniqueOrThrow({ where: { slug: "home-services" } }),
    ).toMatchObject({ name_en: "Home help (edited)", sort_order: 99 });
    expect(
      (await db.skill.findUniqueOrThrow({ where: { slug: "cooking" } }))
        .is_active,
    ).toBe(false);
    // Put it back for the seed test below.
    await db.category.update({
      where: { slug: "home-services" },
      data: { name_en: "Home services", sort_order: 0 },
    });
  }, 60_000);

  it("creates no admin without explicit seed credentials (SEC-1)", async () => {
    const email = `no-default-${randomUUID().slice(0, 8)}@kaj.local`;
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      DATABASE_URL: url.toString(),
      NODE_ENV: "test",
      ADMIN_SEED_EMAIL: email,
    };
    delete env.ADMIN_SEED_PASSWORD;
    delete env.ADMIN_SEED_TOTP_SECRET;
    const output = execFileSync(join(BIN, "tsx"), ["prisma/seed.ts"], {
      cwd: BACKEND,
      env,
      stdio: "pipe",
    }).toString();
    expect(await db.user.count({ where: { email } })).toBe(0);
    expect(output).not.toMatch(/KajAdminLocal123!|JBSWY3DPEHPK3PXP/);
  }, 180_000);

  it("runs the development and demo seeds twice with the same result", async () => {
    const counts = async () => ({
      users: await db.user.count(),
      jobs: await db.job.count(),
      applications: await db.application.count(),
      categories: await db.category.count(),
      flags: await db.featureFlag.count(),
    });
    run("tsx", ["prisma/seed.ts"], { NODE_ENV: "test" });
    run("tsx", ["prisma/demo-seed.ts"], { NODE_ENV: "test" });
    const first = await counts();
    run("tsx", ["prisma/seed.ts"], { NODE_ENV: "test" });
    run("tsx", ["prisma/demo-seed.ts"], { NODE_ENV: "test" });
    expect(await counts()).toEqual(first);
    expect(first.categories).toBe(categories.length);

    // Demo accounts sit in the unassigned 010 range, never a real number.
    const phones = (
      await db.user.findMany({
        where: { phone_e164: { not: null } },
        select: { phone_e164: true },
      })
    ).map((user) => user.phone_e164!);
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone.startsWith("+88010")).toBe(true);
  }, 180_000);
});
