import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  LaunchContentError,
  loadLaunchContent,
} from "../src/modules/launch-content/launch-content.loader";

// Loads the founder-approved launch content: ideas, partner calls, community
// groups and courses from prisma/launch-content/. Safe to re-run (matched by
// seed_key and course slug). Deliberately not part of `seed`, the build or
// the deploy: run it on purpose, once the founder has signed up.
//
// Usage: pnpm seed:launch [--create-founder] [--publish-safety] [--dir path]
//   LAUNCH_FOUNDER_PHONE (E.164, required)   the founder's existing account
//   LAUNCH_FOUNDER_NAME                     the name for --create-founder
//   LAUNCH_WOMEN_MODERATOR_PHONE            a verified woman to moderate
//                                           women-only groups (else held)
//   --create-founder   outside production only: create that account locally
//   --publish-safety   publish safety-critical courses (after a trainer's review)
async function main() {
  const args = process.argv.slice(2);
  const dirFlag = args.indexOf("--dir");
  const dir =
    dirFlag >= 0 && args[dirFlag + 1]
      ? args[dirFlag + 1]!
      : join(__dirname, "launch-content");
  const readJson = (path: string): unknown =>
    JSON.parse(readFileSync(path, "utf8"));
  const courseDir = join(dir, "courses");
  const courses = readdirSync(courseDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((fileName) => ({
      fileName,
      content: readJson(join(courseDir, fileName)),
    }));

  const prisma = new PrismaClient();
  try {
    const result = await loadLaunchContent(
      prisma,
      { ideasAndGroups: readJson(join(dir, "ideas-and-groups.json")), courses },
      {
        founderPhone: process.env.LAUNCH_FOUNDER_PHONE,
        founderName: process.env.LAUNCH_FOUNDER_NAME,
        womenModeratorPhone: process.env.LAUNCH_WOMEN_MODERATOR_PHONE,
        createFounder: args.includes("--create-founder"),
        publishSafety: args.includes("--publish-safety"),
        production: process.env.NODE_ENV === "production",
      },
    );
    const count = (items: unknown[]) => items.length;
    console.log(
      [
        `Founder: ${result.founder.userId}${result.founder.created ? " (created as a local test user)" : ""}`,
        `Ideas: ${count(result.ideas.created)} created, ${count(result.ideas.updated)} updated, ${count(result.ideas.unchanged)} unchanged`,
        `Groups: ${count(result.groups.created)} created, ${count(result.groups.updated)} updated, ${count(result.groups.unchanged)} unchanged, ${count(result.groups.held)} held`,
        ...result.groups.held.map(
          (item) => `  HELD group ${item.key}: ${item.reason}`,
        ),
        `Courses: ${count(result.courses.created)} created, ${count(result.courses.updated) + count(result.courses.versionBumped)} updated, ${count(result.courses.unchanged)} unchanged`,
        ...result.courses.heldUnpublished.map(
          (slug) =>
            `  UNPUBLISHED safety-critical course ${slug}: publish after a qualified trainer's review (--publish-safety)`,
        ),
      ].join("\n"),
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof LaunchContentError
      ? `seed:launch: ${error.message}`
      : error,
  );
  process.exitCode = 1;
});
