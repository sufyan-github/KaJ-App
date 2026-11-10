import { readFileSync } from "node:fs";
import { join } from "node:path";

import { trainingContentSchema } from "../src/modules/training/content/training-content.loader";

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "fixtures/training-content.fixture.json"),
    "utf8",
  ),
) as { courses: Array<Record<string, unknown>> };

describe("training content file", () => {
  it("accepts the fixture and fills defaults", () => {
    const parsed = trainingContentSchema.parse(fixture);
    expect(parsed.courses).toHaveLength(3);
    expect(parsed.courses[0]!.lessons[1]!.youtubeVideoId).toBeNull();
  });

  it("rejects a question whose answer is not among its options", () => {
    const broken = structuredClone(fixture);
    const questions = broken.courses[0]!.questions as Array<
      Record<string, unknown>
    >;
    questions[0]!.correctOptionId = "z";
    expect(trainingContentSchema.safeParse(broken).success).toBe(false);
  });

  it("rejects duplicate course slugs and out-of-range pass marks", () => {
    const duplicate = structuredClone(fixture);
    duplicate.courses[1]!.slug = duplicate.courses[0]!.slug;
    expect(trainingContentSchema.safeParse(duplicate).success).toBe(false);
    const passMark = structuredClone(fixture);
    passMark.courses[0]!.passMarkPct = 0;
    expect(trainingContentSchema.safeParse(passMark).success).toBe(false);
  });

  it("parses the shipped content file when it is present", () => {
    const path = join(__dirname, "../prisma/training-content.json");
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      return;
    }
    const result = trainingContentSchema.safeParse(JSON.parse(raw));
    expect(result.error?.issues ?? []).toEqual([]);
  });
});
