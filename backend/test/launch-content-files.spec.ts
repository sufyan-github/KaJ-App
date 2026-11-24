import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ideasAndGroupsSchema,
  parseLaunchCourseFile,
} from "../src/modules/launch-content/launch-content.loader";

/**
 * Launch content check: every file under prisma/launch-content parses with
 * the loader schemas, so a bad edit fails CI before anyone runs the seed.
 */
const dir = join(__dirname, "..", "prisma", "launch-content");
const courseFiles = readdirSync(join(dir, "courses"))
  .filter((name) => name.endsWith(".json"))
  .sort();
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("launch content files", () => {
  it("has valid ideas, partner calls and groups", () => {
    const content = ideasAndGroupsSchema.parse(
      read(join(dir, "ideas-and-groups.json")),
    );
    expect(content.ideas.length).toBeGreaterThan(0);
    expect(content.groups.length).toBeGreaterThan(0);
  });

  // `it.each` refuses an empty table; the folder may be empty in a branch.
  (courseFiles.length > 0 ? it.each(courseFiles) : it.skip.each(["none"]))(
    "%s follows the course conventions",
    (fileName) => {
      const course = parseLaunchCourseFile(
        fileName,
        read(join(dir, "courses", fileName)),
      );
      // Two checkpoint questions per lesson come first, in lesson order.
      expect(course.questions.length).toBeGreaterThanOrEqual(
        Math.max(course.questionCount, course.lessons.length * 2),
      );
    },
  );

  it("has unique course slugs", () => {
    const slugs = courseFiles.map((name) => name.replace(/\.json$/u, ""));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
