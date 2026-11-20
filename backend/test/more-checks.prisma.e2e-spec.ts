import { PrismaClient } from "@prisma/client";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R3: the database refuses states the audit's constraint probe found
 * accepted (database.md §2.5). Each statement breaks one rule on an
 * existing row inside a transaction that is always rolled back.
 */
const CASES: Array<[string, string]> = [
  [
    "reviews",
    `UPDATE reviews SET reviewee_user_id = reviewer_user_id WHERE id = (SELECT id FROM reviews LIMIT 1)`,
  ],
  [
    "reports",
    `UPDATE reports SET priority = 12 WHERE id = (SELECT id FROM reports LIMIT 1)`,
  ],
  [
    "ledger_entries",
    `UPDATE ledger_entries SET amount_poisha = -100 WHERE id = (SELECT id FROM ledger_entries LIMIT 1)`,
  ],
  [
    "assignments",
    `UPDATE assignments SET agreed_price_poisha = -1 WHERE id = (SELECT id FROM assignments LIMIT 1)`,
  ],
  [
    "business_profiles",
    `UPDATE business_profiles SET business_name = '  ' WHERE id = (SELECT id FROM business_profiles LIMIT 1)`,
  ],
  [
    "sessions",
    `UPDATE sessions SET title = ' ' WHERE id = (SELECT id FROM sessions LIMIT 1)`,
  ],
  [
    "introduction_requests",
    `UPDATE introduction_requests SET expires_at = created_at - interval '1 day' WHERE id = (SELECT id FROM introduction_requests LIMIT 1)`,
  ],
  [
    "idea_detail_views",
    `UPDATE idea_detail_views SET basis = 'GUESS' WHERE id = (SELECT id FROM idea_detail_views LIMIT 1)`,
  ],
  [
    "jobs (workers)",
    `UPDATE jobs SET workers_required = 0 WHERE id = (SELECT id FROM jobs LIMIT 1)`,
  ],
  [
    "jobs (budget)",
    `UPDATE jobs SET budget_min_poisha = 50000, budget_max_poisha = 100 WHERE id = (SELECT id FROM jobs LIMIT 1)`,
  ],
];

databaseDescribe("more CHECK constraints (PostgreSQL)", () => {
  const db = new PrismaClient();

  afterAll(async () => {
    await db.$disconnect();
  });

  it("refuses each invalid state", async () => {
    const accepted: string[] = [];
    for (const [name, sql] of CASES) {
      const outcome = await db
        .$transaction(async (transaction) => {
          const changed = await transaction.$executeRawUnsafe(sql);
          throw new Error(changed ? "ACCEPTED" : "NO_ROW");
        })
        .catch((error: unknown) =>
          error instanceof Error ? error.message : String(error),
        );
      if (outcome === "ACCEPTED") accepted.push(name);
      else if (outcome !== "NO_ROW")
        expect(outcome).toMatch(/23514|check constraint/i);
    }
    expect(accepted).toEqual([]);
  });
});
