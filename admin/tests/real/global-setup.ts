import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const FIXTURE_FILE = join(tmpdir(), "kaaj-admin-journey.json");

/** Creates the journey's job through the backend's fixture script. */
export default function globalSetup() {
  const output = execFileSync(
    "corepack",
    [
      "pnpm",
      "--silent",
      "--filter",
      "@kaj/backend",
      "exec",
      "tsx",
      "test/support/admin-journey.fixture.ts",
    ],
    { env: { ...process.env, NODE_ENV: "test" }, encoding: "utf8" },
  );
  const json = output.slice(output.indexOf("{"));
  writeFileSync(FIXTURE_FILE, json);
}
