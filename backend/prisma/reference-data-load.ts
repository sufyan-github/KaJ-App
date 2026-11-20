/**
 * Production-safe reference-data loader: creates missing categories, skills,
 * business sectors and Rajshahi locations and changes nothing else (no accounts, credentials,
 * flags, settings or fees; existing rows are never overwritten). Safe to run
 * repeatedly in any environment.
 *
 *   pnpm --filter @kaj/backend seed:reference            # apply
 *   pnpm --filter @kaj/backend seed:reference --dry-run  # only report
 *
 * Needs DATABASE_URL. It refuses to guess one: unlike the app, it has no
 * local default, so it can't silently write to the wrong database.
 */
import { PrismaClient } from "@prisma/client";

import { loadReferenceData } from "./reference-data";

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL to the database to load into.");
  const dryRun = process.argv.includes("--dry-run");
  const prisma = new PrismaClient();
  try {
    // One transaction: a failure part-way leaves nothing half-loaded.
    const report = await prisma.$transaction(
      (transaction) => loadReferenceData(transaction, { dryRun }),
      { timeout: 60_000 },
    );
    console.log(
      `${dryRun ? "[dry run] would create" : "Created"}: ` +
        `${report.created.categories} categories, ${report.created.skills} skills, ` +
        `${report.created.locations} locations, ${report.created.businessCategories} business sectors. Already present: ` +
        `${report.existing.categories} categories, ${report.existing.skills} skills, ` +
        `${report.existing.locations} locations, ${report.existing.businessCategories} business sectors. ` +
        `Area centres ${dryRun ? "to set" : "set"}: ${report.centresSet}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
