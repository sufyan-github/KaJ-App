import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pageCsp,
  staticHeaders,
  storageOrigins,
} from "../../lib/security-headers.ts";

test("page CSP uses the nonce, forbids framing and has no unsafe-inline", () => {
  const csp = pageCsp({ nonce: "abc", dev: false, storage: [] });
  assert.match(csp, /script-src 'self' 'nonce-abc' 'strict-dynamic'(;|$)/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.match(csp, /object-src 'none'/u);
  assert.match(csp, /frame-src 'none'/u);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/u);
});

test("development adds only unsafe-eval", () => {
  assert.match(
    pageCsp({ nonce: "n", dev: true, storage: [] }),
    /'strict-dynamic' 'unsafe-eval'/u,
  );
});

test("documents may load from the storage origin only", () => {
  const csp = pageCsp({
    nonce: "n",
    dev: false,
    storage: ["https://files.example.test"],
  });
  assert.match(
    csp,
    /img-src 'self' blob: data: https:\/\/files\.example\.test/u,
  );
  assert.match(csp, /frame-src https:\/\/files\.example\.test/u);
});

test("storage origins come from KAJ_STORAGE_ORIGINS, else S3_ENDPOINT", () => {
  assert.deepEqual(
    storageOrigins({
      KAJ_STORAGE_ORIGINS: "https://a.test https://b.test/path not-a-url",
    }),
    ["https://a.test"],
  );
  assert.deepEqual(storageOrigins({ S3_ENDPOINT: "http://localhost:9000/" }), [
    "http://localhost:9000",
  ]);
  assert.deepEqual(storageOrigins({}), []);
});

test("HSTS only in production; referrer and framing always", () => {
  const keys = (production: boolean) =>
    staticHeaders(production).map((header) => header.key);
  assert.ok(keys(true).includes("Strict-Transport-Security"));
  assert.ok(!keys(false).includes("Strict-Transport-Security"));
  for (const production of [true, false]) {
    const headers = Object.fromEntries(
      staticHeaders(production).map((h) => [h.key, h.value]),
    );
    assert.equal(headers["Referrer-Policy"], "no-referrer");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  }
});
