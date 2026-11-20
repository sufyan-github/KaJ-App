import { PrismaClient } from "@prisma/client";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R3 schema: no accidental camelCase columns (Prisma inventing the other
 * side of a one-sided relation), and every foreign key has an index that
 * starts with it.
 */
databaseDescribe("schema hygiene (PostgreSQL)", () => {
  const db = new PrismaClient();

  afterAll(async () => {
    await db.$disconnect();
  });

  it("has no camelCase columns", async () => {
    const rows = await db.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name ~ '[A-Z]'
        AND table_name <> '_prisma_migrations'`;
    expect(rows).toEqual([]);
  });

  it("indexes every foreign key column", async () => {
    const rows = await db.$queryRaw<
      Array<{ table_name: string; column_name: string }>
    >`
      SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i
          WHERE i.indrelid = c.conrelid AND i.indkey[0] = c.conkey[1]
            AND i.indpred IS NULL
        )`;
    expect(rows).toEqual([]);
  });
});
