import "reflect-metadata";
import { ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AUTH_RATE_LIMITER } from "../src/modules/auth/auth-rate-limiter";
import {
  api,
  cleanupPhones,
  codeFrom,
  configureBdappsEnvironment,
  createCarrierPlan,
  deleteCarrierPlan,
  enableSubscriptionGate,
  TEST_INTERNAL_KEY,
} from "./fixtures/bdapps-e2e.fixture";

// Full stack: Nest (SMS_PROVIDER=bdapps, OPERATOR_PROVIDER=bdapps) -> PHP gateway
// (`php -S`) -> bdapps-gateway/dev/mock-bdapps.mjs, plus mock -> callback.php ->
// Nest webhook. Synthetic numbers and throwaway credentials only.
const GATEWAY_ROOT = join(__dirname, "..", "..", "bdapps-gateway");
const PHONES = {
  fresh: "+8801810009401",
  subscribed: "+8801610009402",
  masked: "+8801810009403",
};
const OTP = "123456";

function phpReady(): boolean {
  const probe = spawnSync(
    process.env.PHP_BINARY ?? "php",
    ["-r", 'echo extension_loaded("curl") ? "ok" : "no-curl";'],
    { encoding: "utf8" },
  );
  if (probe.error || probe.status !== 0) {
    console.warn("BDAPPS_STACK_E2E skipped: php is not installed");
    return false;
  }
  if (probe.stdout.trim() !== "ok") {
    console.warn("BDAPPS_STACK_E2E skipped: php-curl is missing");
    return false;
  }
  return true;
}

const stackDescribe =
  process.env.BDAPPS_STACK_E2E === "1" && phpReady() ? describe : describe.skip;

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

stackDescribe("BDApps full stack (mock BDApps + PHP gateway + Nest)", () => {
  jest.setTimeout(60_000);
  const savedEnvironment = { ...process.env };
  const children: ChildProcess[] = [];
  const work = mkdtempSync(join(tmpdir(), "kaaj-bdapps-stack-"));
  const appPassword = `test-${randomBytes(12).toString("hex")}`;
  let mockUrl: string;
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof api>;
  let restoreGate: () => Promise<void>;
  let webhookSpy: jest.SpyInstance;

  const mock = {
    post: async (path: string, body: Record<string, unknown> = {}) => {
      const response = await fetch(`${mockUrl}${path}`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      return (await response.json()) as Record<string, unknown>;
    },
    sms: async (phone: string) => {
      const response = await fetch(`${mockUrl}/__sms?msisdn=${phone.slice(1)}`);
      const body = (await response.json()) as {
        messages: Array<{ address: string; message: string }>;
      };
      return body.messages;
    },
    status: async (phone: string) => {
      const response = await fetch(`${mockUrl}/__subscribers`);
      const body = (await response.json()) as {
        subscribers: Record<string, { status: string; maskedId: string }>;
      };
      return (
        body.subscribers[phone.slice(1)] ?? { maskedId: "", status: "MISSING" }
      );
    },
  };

  beforeAll(async () => {
    const [mockPort, phpPort] = await Promise.all([freePort(), freePort()]);
    mockUrl = `http://127.0.0.1:${mockPort}`;
    const gatewayUrl = `http://127.0.0.1:${phpPort}`;
    configureBdappsEnvironment(`${gatewayUrl}/api`);

    const { AppModule } = await import("../src/app.module");
    const { configureApp } = await import("../src/app.bootstrap");
    const { SubscriptionsService } =
      await import("../src/modules/subscriptions/subscriptions.service");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_RATE_LIMITER)
      .useValue({
        consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    const nestUrl = await app.getUrl();
    prisma = app.get(PrismaService);
    http = api(app);
    webhookSpy = jest.spyOn(
      app.get(SubscriptionsService),
      "applyBdappsWebhook",
    );

    const envFile = join(work, "gateway.env");
    writeFileSync(
      envFile,
      [
        "BDAPPS_APP_ID=test-app-id",
        `BDAPPS_PASSWORD=${appPassword}`,
        "BDAPPS_APP_HASH=testhash01",
        `BDAPPS_API_BASE=${mockUrl}`,
        `INTERNAL_API_KEY=${TEST_INTERNAL_KEY}`,
        `NODE_BACKEND_URL=${nestUrl.replace("[::1]", "127.0.0.1")}`,
        "NODE_BACKEND_WEBHOOK_PATH=/api/v1/subscriptions/bdapps/webhook",
        `GATEWAY_STORAGE_DIR=${join(work, "storage")}`,
        // Throttling is covered by dev/gateway-smoke.mjs; disable it here so
        // consecutive notifications for one subscriber are all processed.
        "CALLBACK_THROTTLE_SECONDS=0",
      ].join("\n"),
      { mode: 0o600 },
    );
    const spawnQuiet = (command: string, args: string[], env: object) => {
      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ["ignore", "ignore", "ignore"],
      });
      children.push(child);
    };
    spawnQuiet(
      process.execPath,
      [join(GATEWAY_ROOT, "dev", "mock-bdapps.mjs")],
      {
        MOCK_APP_ID: "test-app-id",
        MOCK_APP_PASSWORD: appPassword,
        MOCK_CALLBACK_URL: `${gatewayUrl}/api/callback.php`,
        MOCK_PORT: String(mockPort),
      },
    );
    spawnQuiet(
      process.env.PHP_BINARY ?? "php",
      ["-S", `127.0.0.1:${phpPort}`, "-t", GATEWAY_ROOT],
      { KAAJ_GATEWAY_ENV_FILE: envFile, PHP_CLI_SERVER_WORKERS: "4" },
    );
    await waitFor(`${mockUrl}/__health`);
    await waitFor(`${gatewayUrl}/api/status.php`);

    await cleanupPhones(prisma, Object.values(PHONES));
    await deleteCarrierPlan(prisma);
    await createCarrierPlan(prisma);
    restoreGate = await enableSubscriptionGate(prisma);
  });

  afterAll(async () => {
    for (const child of children) child.kill("SIGTERM");
    if (prisma) {
      await cleanupPhones(prisma, Object.values(PHONES));
      await deleteCarrierPlan(prisma);
      await restoreGate?.();
    }
    await app?.close();
    rmSync(work, { force: true, recursive: true });
    process.env = savedEnvironment;
  });

  async function register(phone: string) {
    const otp = await http.requestOtp(phone).expect(201);
    const verified = await http
      .verifyOtp(otp.body.data.challengeId, OTP, randomUUID())
      .expect(201);
    return verified.body.data.accessToken as string;
  }

  async function activeSubscriptions(phone: string) {
    return prisma.subscription.count({
      where: {
        status: "ACTIVE",
        expires_at: { gt: new Date() },
        user: { phone_e164: phone },
      },
    });
  }

  it("gateway contract: every PHP endpoint against the mock (dev/gateway-smoke.mjs)", async () => {
    const result = spawnSync(
      process.execPath,
      [join(GATEWAY_ROOT, "dev", "gateway-smoke.mjs")],
      { encoding: "utf8", timeout: 50_000 },
    );
    expect(result.stdout).toContain("0 failed");
    expect(result.status).toBe(0);
  });

  let freshToken: string;

  it("registers a new number via carrier OTP with access active immediately", async () => {
    const otp = await http.requestOtp(PHONES.fresh).expect(201);
    const wrong = await http
      .verifyOtp(otp.body.data.challengeId, "000000", randomUUID())
      .expect(401);
    expect(wrong.body.error.code).toBe("OTP_INVALID");
    const verified = await http
      .verifyOtp(otp.body.data.challengeId, OTP, randomUUID())
      .expect(201);
    freshToken = verified.body.data.accessToken;
    expect(verified.body.data.isNewUser).toBe(true);
    const me = await http.me(freshToken).expect(200);
    expect(me.body.data).toMatchObject({
      accessActive: true,
      carrierStatus: "REGISTERED",
      current: { status: "ACTIVE" },
      operatorPlanMissing: false,
    });
    expect((await mock.status(PHONES.fresh)).status).toBe("REGISTERED");
  });

  it("logs in an already-subscribed number with a KAAJ code sent through BDApps SMS", async () => {
    await mock.post("/__state", {
      msisdn: PHONES.subscribed.slice(1),
      status: "REGISTERED",
    });
    const otp = await http.requestOtp(PHONES.subscribed).expect(201);
    const messages = await mock.sms(PHONES.subscribed);
    expect(messages).toHaveLength(1);
    const verified = await http
      .verifyOtp(
        otp.body.data.challengeId,
        codeFrom(messages[0]!.message),
        randomUUID(),
      )
      .expect(201);
    const me = await http.me(verified.body.data.accessToken).expect(200);
    expect(me.body.data.accessActive).toBe(true);
  });

  it("recovers the password of a subscribed number", async () => {
    const otp = await http.recoveryRequest(PHONES.subscribed).expect(201);
    const messages = await mock.sms(PHONES.subscribed);
    expect(messages).toHaveLength(2);
    await http
      .recoveryVerify(
        otp.body.data.challengeId,
        codeFrom(messages.at(-1)!.message),
        "stack test passphrase 1",
      )
      .expect(201);
    await http
      .passwordLogin(PHONES.subscribed, "stack test passphrase 1", randomUUID())
      .expect(201);
  });

  it("stores and reuses masked subscriber ids", async () => {
    await mock.post("/__config", { mask: true });
    let token: string;
    try {
      token = await register(PHONES.masked);
    } finally {
      await mock.post("/__config", { mask: false });
    }
    const { maskedId } = await mock.status(PHONES.masked);
    const identity = await prisma.userOperatorIdentity.findFirstOrThrow({
      where: { user: { phone_e164: PHONES.masked } },
    });
    expect(identity.provider_subscriber_id).toBe(maskedId);
    expect((await http.me(token).expect(200)).body.data.accessActive).toBe(
      true,
    );

    // A masked notification is resolved through the stored id.
    await mock.post("/__config", { mask: true });
    try {
      await mock.post("/__notify", {
        msisdn: PHONES.masked.slice(1),
        status: "UNREGISTERED",
      });
    } finally {
      await mock.post("/__config", { mask: false });
    }
    expect(await activeSubscriptions(PHONES.masked)).toBe(0);
  });

  it("cancels in-app: the carrier shows UNREGISTERED and local access ends", async () => {
    const cancelled = await http.cancel(freshToken).expect(201);
    expect(cancelled.body.data).toMatchObject({
      accessActive: false,
      carrierStatus: "UNREGISTERED",
      current: { status: "CANCELLED" },
    });
    expect((await mock.status(PHONES.fresh)).status).toBe("UNREGISTERED");
  });

  it("restores access from a BDApps REGISTERED notification and ignores its replay", async () => {
    const before = webhookSpy.mock.calls.length;
    const notified = await mock.post("/__notify", {
      msisdn: PHONES.fresh.slice(1),
      status: "REGISTERED",
    });
    expect(notified.callbackStatus).toBe(200);
    expect(JSON.parse(String(notified.callbackBody))).toEqual({
      statusCode: "S1000",
      statusDetail: "Request was successfully processed",
    });
    expect(webhookSpy.mock.calls.length).toBe(before + 1);
    expect(await activeSubscriptions(PHONES.fresh)).toBe(1);
    expect((await http.me(freshToken).expect(200)).body.data.accessActive).toBe(
      true,
    );

    const replayed = await mock.post("/__replay");
    expect(replayed.callbackStatus).toBe(200);
    expect(webhookSpy.mock.calls.length).toBe(before + 1);
  });

  it("keeps access while the carrier reports PENDING CHARGE", async () => {
    await mock.post("/__notify", {
      msisdn: PHONES.fresh.slice(1),
      status: "PENDING CHARGE",
    });
    const me = await http.me(freshToken).expect(200);
    expect(me.body.data).toMatchObject({
      accessActive: true,
      carrierStatus: "CHARGE_PENDING",
    });
    expect(await activeSubscriptions(PHONES.fresh)).toBe(1);
  });
});
