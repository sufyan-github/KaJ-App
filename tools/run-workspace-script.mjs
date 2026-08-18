import { spawnSync } from "node:child_process";

const allowedScripts = new Set(["dev", "migrate", "seed"]);
const script = process.argv[2];

if (!allowedScripts.has(script)) {
  console.error(`Unsupported workspace script: ${script ?? "<missing>"}`);
  process.exit(2);
}

const executable = process.platform === "win32" ? "corepack.cmd" : "corepack";
const recursiveArgs = ["pnpm", "--recursive"];

if (script === "dev") recursiveArgs.push("--parallel");
recursiveArgs.push("--if-present", "run", script);

const result = spawnSync(executable, recursiveArgs, {
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
