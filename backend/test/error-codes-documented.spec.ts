import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * R3 / W15: every error code the backend can answer is in
 * docs/api/error-codes.md (with Bangla and English), so the app can map
 * it. A new `code: "..."` without a doc row fails here.
 */
const SRC = join(__dirname, "..", "src");
const DOC = readFileSync(
  join(__dirname, "..", "..", "docs", "api", "error-codes.md"),
  "utf8",
);

/** Values that look like codes but are not errors (enums, match reasons). */
const NOT_ERRORS = new Set([
  "APPROVED_MENTOR",
  "AT_HOME",
  "AVAILABLE",
  "CHAT_SAFETY",
  "HYBRID",
  "IDENTITY_VERIFIED",
  "IN_PERSON",
  "NEARBY",
  "ONLINE",
  "SAME_AREA",
  "SKILLS",
  "SKILL_VERIFIED",
]);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? files(path)
      : path.endsWith(".ts")
        ? [path]
        : [];
  });

describe("error codes are documented", () => {
  it("lists every code the backend throws", () => {
    const codes = new Set<string>();
    for (const file of files(SRC)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/code: "([A-Z][A-Z_]{3,})"/g))
        codes.add(match[1]!);
    }
    const missing = [...codes]
      .filter((code) => !NOT_ERRORS.has(code))
      .filter((code) => !DOC.includes(`\`${code}\``))
      .sort();
    expect(missing).toEqual([]);
  });
});
