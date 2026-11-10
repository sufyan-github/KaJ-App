import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { loadTrainingContent } from "../src/modules/training/content/training-content.loader";

// Loads course content only. Safe to re-run: courses are upserted by slug.
// Usage: pnpm seed:training [--publish] [--file path/to/content.json]
// Deliberately not part of `seed` or the deploy build.
async function main() {
  const args = process.argv.slice(2);
  const fileFlag = args.indexOf("--file");
  const file =
    fileFlag >= 0 && args[fileFlag + 1]
      ? args[fileFlag + 1]!
      : join(__dirname, "training-content.json");
  const publish = args.includes("--publish");
  const content: unknown = JSON.parse(readFileSync(file, "utf8"));

  const prisma = new PrismaClient();
  try {
    const result = await loadTrainingContent(prisma, content, { publish });
    console.log(JSON.stringify({ file, publish, ...result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
