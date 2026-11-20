/** @type {import('jest').Config} */
module.exports = {
  clearMocks: true,
  // One worker runs the suites one after another (the database suites must
  // not overlap); it is replaced when it holds more than this between
  // files, so memory no longer piles up across 130+ suites (it reached the
  // 2 GB heap limit and aborted with exit 134).
  workerIdleMemoryLimit: "1GB",
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts"],
  coverageDirectory: "coverage",
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "test/tsconfig.json" }],
  },
};
