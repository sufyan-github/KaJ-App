#!/usr/bin/env node
// End-to-end check of the PHP gateway against dev/mock-bdapps.mjs.
// Starts: the mock, `php -S` serving this gateway with a throwaway env file,
// and a tiny HMAC-verifying stand-in for the Nest webhook. Exercises every
// endpoint. No real credentials, no network beyond 127.0.0.1.
//
//   node bdapps-gateway/dev/gateway-smoke.mjs        (exit 0 = pass, 77 = php missing)
import { spawn, spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strict as assert } from "node:assert";

const here = dirname(fileURLToPath(import.meta.url));
const gatewayRoot = dirname(here);
const php = process.env.PHP_BINARY ?? "php";

const probe = spawnSync(
  php,
  ["-r", 'echo extension_loaded("curl") ? "ok" : "no-curl";'],
  { encoding: "utf8" },
);
if (probe.error || probe.status !== 0) {
  console.log("SKIP: php is not installed");
  process.exit(77);
}
if (probe.stdout.trim() !== "ok") {
  console.log("SKIP: the php curl extension is missing (install php-curl)");
  process.exit(77);
}

const KEY = randomBytes(24).toString("hex");
const APP_ID = "test-app-id";
const APP_PASSWORD = `test-${randomBytes(12).toString("hex")}`;
const children = [];
const work = mkdtempSync(join(tmpdir(), "kaaj-gw-smoke-"));
let failures = 0;
let passed = 0;

function freePort() {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`timed out waiting for ${url}`);
}

function start(command, args, env) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.resume();
  child.stderr.resume();
  children.push(child);
  return child;
}

function cleanup() {
  for (const child of children) child.kill("SIGTERM");
  rmSync(work, { force: true, recursive: true });
}

const nestEvents = [];
const [mockPort, phpPort, nestPort] = await Promise.all([
  freePort(),
  freePort(),
  freePort(),
]);
const mock = `http://127.0.0.1:${mockPort}`;
const gateway = `http://127.0.0.1:${phpPort}`;

// Stand-in for POST /api/v1/subscriptions/bdapps/webhook: verifies the HMAC.
const nest = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const timestamp = request.headers["x-timestamp"];
  const nonce = request.headers["x-nonce"];
  const expected = createHmac("sha256", KEY)
    .update(Buffer.concat([raw, Buffer.from(`${timestamp}${nonce}`)]))
    .digest("hex");
  const valid =
    expected === request.headers["x-signature"] &&
    request.headers["x-api-key"] === undefined;
  nestEvents.push({
    body: JSON.parse(raw.toString("utf8")),
    path: request.url,
    valid,
  });
  response.writeHead(valid ? 201 : 401, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ data: { processed: valid } }));
});
await new Promise((resolve) => nest.listen(nestPort, "127.0.0.1", resolve));

const envFile = join(work, "gateway.env");
const storage = join(work, "storage");
writeFileSync(
  envFile,
  [
    `BDAPPS_APP_ID=${APP_ID}`,
    `BDAPPS_PASSWORD=${APP_PASSWORD}`,
    "BDAPPS_APP_HASH=testhash01",
    `BDAPPS_API_BASE=${mock}`,
    `INTERNAL_API_KEY=${KEY}`,
    `NODE_BACKEND_URL=http://127.0.0.1:${nestPort}`,
    "NODE_BACKEND_WEBHOOK_PATH=/api/v1/subscriptions/bdapps/webhook",
    `GATEWAY_STORAGE_DIR=${storage}`,
    "CALLBACK_THROTTLE_SECONDS=10",
  ].join("\n"),
  { mode: 0o600 },
);

start(process.execPath, [join(here, "mock-bdapps.mjs")], {
  MOCK_APP_ID: APP_ID,
  MOCK_APP_PASSWORD: APP_PASSWORD,
  MOCK_CALLBACK_URL: `${gateway}/api/callback.php`,
  MOCK_PORT: String(mockPort),
});
start(php, ["-S", `127.0.0.1:${phpPort}`, "-t", gatewayRoot], {
  KAAJ_GATEWAY_ENV_FILE: envFile,
});
await waitFor(`${mock}/__health`);
await waitFor(`${gateway}/api/status.php`);

function signed(
  body,
  { apiKey, nonce = randomBytes(16).toString("hex"), timestamp } = {},
) {
  const raw = JSON.stringify(body);
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const headers = {
    "Content-Type": "application/json",
    "X-Nonce": nonce,
    "X-Signature": createHmac("sha256", KEY)
      .update(raw + ts + nonce)
      .digest("hex"),
    "X-Timestamp": ts,
  };
  if (apiKey !== undefined) headers["X-API-Key"] = apiKey;
  return { body: raw, headers, method: "POST" };
}

async function call(endpoint, init) {
  const response = await fetch(`${gateway}/api/${endpoint}`, init);
  const text = await response.text();
  assert.ok(
    !/BDAPPS_|INTERNAL_API_KEY|NODE_BACKEND|Exception|Stack trace/u.test(text),
    `leaky body: ${text}`,
  );
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  return { json, status: response.status, text };
}

const post = (endpoint, body, options) => call(endpoint, signed(body, options));
const mockPost = (path, body) =>
  fetch(`${mock}${path}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }).then((r) => r.json());

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`ok   ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}

const A = "8801812345671";
const B = "8801612345672";
const C = "8801812345673";

try {
  await check("non-POST is rejected with 405", async () => {
    const response = await call("status.php", { method: "GET" });
    assert.equal(response.status, 405);
  });
  await check("unsigned request is rejected generically", async () => {
    const response = await call("status.php", {
      body: "{}",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    assert.equal(response.status, 403);
    assert.deepEqual(response.json, {
      statusCode: "GW_FORBIDDEN",
      statusDetail: "Forbidden",
    });
  });
  await check("a wrong optional X-API-Key is rejected", async () => {
    const response = await post(
      "status.php",
      { subscriberId: `tel:${A}` },
      { apiKey: "x".repeat(48) },
    );
    assert.equal(response.status, 403);
  });
  await check("a matching optional X-API-Key is accepted", async () => {
    const response = await post(
      "status.php",
      { subscriberId: `tel:${A}` },
      { apiKey: KEY },
    );
    assert.equal(response.status, 200);
  });
  await check("stale timestamps and replayed nonces are rejected", async () => {
    const stale = await post(
      "status.php",
      { subscriberId: `tel:${A}` },
      { timestamp: String(Math.floor(Date.now() / 1000) - 900) },
    );
    assert.equal(stale.status, 403);
    const nonce = randomBytes(16).toString("hex");
    assert.equal(
      (await post("status.php", { subscriberId: `tel:${A}` }, { nonce }))
        .status,
      200,
    );
    assert.equal(
      (await post("status.php", { subscriberId: `tel:${A}` }, { nonce }))
        .status,
      403,
    );
  });
  await check("a tampered body fails the signature", async () => {
    const init = signed({ subscriberId: `tel:${A}` });
    init.body = JSON.stringify({ subscriberId: `tel:${B}` });
    assert.equal((await call("status.php", init)).status, 403);
  });
  await check("input validation returns generic 400s", async () => {
    for (const [endpoint, body] of [
      ["status.php", { subscriberId: "8801812345671" }],
      ["status.php", { subscriberId: "tel:<script>" }],
      ["otp_verify.php", { otp: "12ab", referenceNo: "ref12345" }],
      ["otp_verify.php", { otp: "123456", referenceNo: "../../etc" }],
      ["sms_send.php", { message: "x".repeat(161), subscriberId: `tel:${A}` }],
      ["sms_send.php", { message: "", subscriberId: `tel:${A}` }],
    ]) {
      const response = await post(endpoint, body);
      assert.equal(response.status, 400, `${endpoint} ${JSON.stringify(body)}`);
      assert.deepEqual(response.json, {
        statusCode: "GW_BAD_REQUEST",
        statusDetail: "Invalid request",
      });
    }
  });
  let referenceNo;
  await check("otp_request returns a referenceNo", async () => {
    const response = await post("otp_request.php", {
      subscriberId: `tel:${A}`,
    });
    assert.equal(response.json.statusCode, "S1000");
    referenceNo = response.json.referenceNo;
    assert.match(referenceNo, /^[A-Za-z0-9_-]{4,64}$/u);
  });
  await check("otp_verify maps a wrong code to E1850", async () => {
    const response = await post("otp_verify.php", {
      otp: "000000",
      referenceNo,
    });
    assert.equal(response.json.statusCode, "E1850");
  });
  await check("otp_verify registers on the right code", async () => {
    const response = await post("otp_verify.php", {
      otp: "123456",
      referenceNo,
    });
    assert.equal(response.json.statusCode, "S1000");
    assert.equal(response.json.subscriberId, `tel:${A}`);
    assert.equal(response.json.subscriptionStatus, "REGISTERED");
  });
  await check("otp_request for a registered number is E1351", async () => {
    const response = await post("otp_request.php", {
      subscriberId: `tel:${A}`,
    });
    assert.equal(response.json.statusCode, "E1351");
  });
  await check(
    "E1851 expired and E1852 attempts are passed through",
    async () => {
      const first = await post("otp_request.php", { subscriberId: `tel:${B}` });
      for (let i = 0; i < 3; i++)
        await post("otp_verify.php", {
          otp: "000000",
          referenceNo: first.json.referenceNo,
        });
      assert.equal(
        (
          await post("otp_verify.php", {
            otp: "123456",
            referenceNo: first.json.referenceNo,
          })
        ).json.statusCode,
        "E1852",
      );
      const second = await post("otp_request.php", {
        subscriberId: `tel:${B}`,
      });
      await mockPost("/__expire", {});
      assert.equal(
        (
          await post("otp_verify.php", {
            otp: "123456",
            referenceNo: second.json.referenceNo,
          })
        ).json.statusCode,
        "E1851",
      );
    },
  );
  await check("status uses getStatus", async () => {
    assert.equal(
      (await post("status.php", { subscriberId: `tel:${A}` })).json
        .subscriptionStatus,
      "REGISTERED",
    );
    assert.equal(
      (await post("status.php", { subscriberId: `tel:${B}` })).json
        .subscriptionStatus,
      "UNREGISTERED",
    );
  });
  await check("sms_send delivers to a registered subscriber", async () => {
    const response = await post("sms_send.php", {
      message: "KAAJ verification code: 654321.",
      subscriberId: `tel:${A}`,
    });
    assert.equal(response.json.statusCode, "S1000");
    const { messages } = await fetch(`${mock}/__sms?msisdn=${A}`).then((r) =>
      r.json(),
    );
    assert.equal(messages.at(-1).message, "KAAJ verification code: 654321.");
  });
  await check("sms_send surfaces a failed destination", async () => {
    const response = await post("sms_send.php", {
      message: "hello",
      subscriberId: `tel:${B}`,
    });
    assert.equal(response.json.statusCode, "E1325");
  });
  await check(
    "unsubscribe returns UNREGISTERED, and E1356 maps to success",
    async () => {
      const first = await post("unsubscribe.php", { subscriberId: `tel:${A}` });
      assert.deepEqual(
        [first.json.statusCode, first.json.subscriptionStatus],
        ["S1000", "UNREGISTERED"],
      );
      const again = await post("unsubscribe.php", { subscriberId: `tel:${A}` });
      assert.deepEqual(
        [again.json.statusCode, again.json.subscriptionStatus],
        ["S1000", "UNREGISTERED"],
      );
    },
  );
  await check("masked subscriber ids work end to end", async () => {
    await mockPost("/__config", { mask: true });
    const request = await post("otp_request.php", { subscriberId: `tel:${C}` });
    const verify = await post("otp_verify.php", {
      otp: "123456",
      referenceNo: request.json.referenceNo,
    });
    assert.match(verify.json.subscriberId, /^tel:B%3C/u);
    const status = await post("status.php", {
      subscriberId: verify.json.subscriberId,
    });
    assert.equal(status.json.subscriptionStatus, "REGISTERED");
    await mockPost("/__config", { mask: false });
  });
  await check(
    "callback rejects GET and wrong application credentials",
    async () => {
      assert.equal((await call("callback.php", { method: "GET" })).status, 405);
      const forged = await call("callback.php", {
        body: JSON.stringify({
          applicationId: APP_ID,
          password: "wrong",
          status: "REGISTERED",
          subscriberId: `tel:${A}`,
          timeStamp: "2611111200",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      assert.equal(forged.status, 403);
      const otherApp = await call("callback.php", {
        body: JSON.stringify({
          applicationId: "APP_OTHER",
          status: "REGISTERED",
          subscriberId: `tel:${A}`,
          timeStamp: "2611111200",
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      assert.equal(otherApp.status, 403);
      assert.equal(nestEvents.length, 0);
    },
  );
  await check(
    "callback re-queries getStatus and forwards a signed event without X-API-Key",
    async () => {
      const result = await mockPost("/__notify", {
        msisdn: A,
        status: "REGISTERED",
      });
      assert.equal(result.callbackStatus, 200);
      assert.deepEqual(JSON.parse(result.callbackBody), {
        statusCode: "S1000",
        statusDetail: "Request was successfully processed",
      });
      assert.equal(nestEvents.length, 1);
      const [event] = nestEvents;
      assert.equal(event.valid, true);
      assert.equal(event.path, "/api/v1/subscriptions/bdapps/webhook");
      assert.equal(event.body.subscriberId, `tel:${A}`);
      assert.equal(event.body.status, "REGISTERED");
      assert.equal(event.body.frequency, "daily");
      assert.equal(event.body.providerTimeStamp, result.notification.timeStamp);
    },
  );
  await check(
    "a replayed notification is acknowledged but not forwarded",
    async () => {
      const replay = await mockPost("/__replay", {});
      assert.equal(replay.callbackStatus, 200);
      assert.equal(nestEvents.length, 1);
    },
  );
  await check("bursts for one subscriber are throttled", async () => {
    const burst = await mockPost("/__notify", {
      msisdn: A,
      status: "UNREGISTERED",
    });
    assert.equal(burst.callbackStatus, 200);
    assert.equal(nestEvents.length, 1);
  });
  await check(
    "PENDING CHARGE is forwarded as CHARGE_PENDING, unregistered as UNSUBSCRIBED",
    async () => {
      await mockPost("/__notify", { msisdn: B, status: "PENDING CHARGE" });
      assert.equal(nestEvents.at(-1).body.status, "CHARGE_PENDING");
      await mockPost("/__notify", {
        msisdn: "8801812345674",
        status: "UNREGISTERED",
      });
      assert.equal(nestEvents.at(-1).body.status, "UNSUBSCRIBED");
      assert.ok(nestEvents.every((event) => event.valid));
    },
  );
  await check(
    "a masked notification is forwarded with the masked id",
    async () => {
      await mockPost("/__config", { mask: true });
      const result = await mockPost("/__notify", {
        msisdn: C,
        status: "UNREGISTERED",
      });
      assert.match(nestEvents.at(-1).body.subscriberId, /^tel:B%3C/u);
      assert.equal(
        nestEvents.at(-1).body.subscriberId,
        result.notification.subscriberId,
      );
      await mockPost("/__config", { mask: false });
    },
  );
  await check(
    "BDApps failures pass through as HTTP 200 + statusCode",
    async () => {
      await mockPost("/__config", { failStatus: true });
      const response = await post("status.php", { subscriberId: `tel:${A}` });
      assert.equal(response.json.statusCode, "E1601");
      await mockPost("/__config", { failStatus: false });
    },
  );
  await check(
    "logs never contain OTPs, messages, passwords or the HMAC key",
    async () => {
      const log = existsSync(join(storage, "gateway.log"))
        ? readFileSync(join(storage, "gateway.log"), "utf8")
        : "";
      assert.ok(log.length > 0, "gateway.log was not written");
      for (const secret of ["123456", "654321", APP_PASSWORD, KEY, A, C]) {
        assert.ok(!log.includes(secret), `log leaks ${secret.slice(0, 4)}...`);
      }
    },
  );
} finally {
  nest.close();
  cleanup();
}

console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
