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
// the deploy: run it on purpose.
//
// Usage: pnpm seed:launch [--publish-safety] [--dir path]
//   LAUNCH_OWNER_EMAIL            the admin account that owns the content
//                                 (else ADMIN_SEED_EMAIL, else the only admin)
//   LAUNCH_OWNER_NAME             its display name (default "KAAJ")
//   LAUNCH_WOMEN_MODERATOR_PHONE  a verified woman to moderate women-only
//                                 groups (else they are held)
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
        ownerEmail: process.env.LAUNCH_OWNER_EMAIL,
        adminSeedEmail: process.env.ADMIN_SEED_EMAIL,
        ownerName: process.env.LAUNCH_OWNER_NAME,
        womenModeratorPhone: process.env.LAUNCH_WOMEN_MODERATOR_PHONE,
        publishSafety: args.includes("--publish-safety"),
      },
    );
    const count = (items: unknown[]) => items.length;
    console.log(
      [
        `Owner: ${result.owner.email} (${result.owner.userId})${result.owner.profileUpdated ? ", profile name/area set" : ""}`,
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
