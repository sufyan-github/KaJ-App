import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { BdappsGatewayClient } from "../src/infra/bdapps/bdapps-gateway.client";
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
} from "./fixtures/bdapps-e2e.fixture";

// Synthetic numbers only; the BDApps gateway is replaced by an in-memory fake.
const PHONES = {
  fresh: "+8801810009301",
  wrong: "+8801610009302",
  subscribed: "+8801810009303",
  masked: "+8801610009304",
  cancel: "+8801810009305",
  planless: "+8801810009306",
  failing: "+8801810009307",
};
const OTP = "123456";
const databaseDescribe =
  process.env.BDAPPS_DATABASE_E2E === "1" ? describe : describe.skip;

/** Behaves like the PHP gateway in front of BDApps (see bdapps-gateway/dev/mock-bdapps.mjs). */
class FakeBdappsGateway {
  mask = false;
  failSms = false;
  failUnsubscribe = false;
  verifyOverride: string | null = null;
  readonly subscribers = new Map<string, string>();
  readonly references = new Map<string, string>();
  readonly sms: Array<{ message: string; subscriberId: string }> = [];
  readonly calls: Array<[string, Record<string, string>]> = [];

  maskedId(msisdn: string) {
    const digest = createHash("sha256").update(msisdn).digest("base64");
    return `tel:B%3C${digest.slice(0, 30)}==`;
  }

  msisdnOf(subscriberId: string) {
    if (/^tel:8801\d{9}$/u.test(subscriberId)) return subscriberId.slice(4);
    for (const msisdn of this.subscribers.keys()) {
      if (this.maskedId(msisdn) === subscriberId) return msisdn;
    }
    return null;
  }

  async post(endpoint: string, payload: Record<string, string>) {
    this.calls.push([endpoint, payload]);
    const msisdn = payload.subscriberId
      ? this.msisdnOf(payload.subscriberId)
      : null;
    switch (endpoint) {
      case "otp_request.php": {
        if (this.subscribers.get(msisdn!) === "REGISTERED")
          return { statusCode: "E1351" };
        const referenceNo = randomUUID().replaceAll("-", "");
        this.references.set(referenceNo, msisdn!);
        return { referenceNo, statusCode: "S1000" };
      }
      case "otp_verify.php": {
        if (this.verifyOverride) return { statusCode: this.verifyOverride };
        const owner = this.references.get(payload.referenceNo!);
        if (!owner) return { statusCode: "E1855" };
        if (payload.otp !== OTP) return { statusCode: "E1850" };
        this.subscribers.set(owner, "REGISTERED");
        return {
          statusCode: "S1000",
          subscriberId: this.mask ? this.maskedId(owner) : `tel:${owner}`,
          subscriptionStatus: "REGISTERED",
        };
      }
      case "status.php":
        return {
          statusCode: "S1000",
          subscriptionStatus:
            this.subscribers.get(msisdn ?? "") ?? "UNREGISTERED",
        };
      case "unsubscribe.php":
        if (this.failUnsubscribe) return { statusCode: "E1601" };
        this.subscribers.set(msisdn!, "UNREGISTERED");
        return { statusCode: "S1000", subscriptionStatus: "UNREGISTERED" };
      case "sms_send.php":
        if (this.failSms) return { statusCode: "E1601" };
        this.sms.push({
          message: payload.message!,
          subscriberId: payload.subscriberId!,
        });
        return { requestId: "r", statusCode: "S1000" };
      default:
        throw new Error(`unexpected endpoint ${endpoint}`);
    }
  }
}

databaseDescribe("BDApps carrier subscription with the database", () => {
  const savedEnvironment = { ...process.env };
  const gateway = new FakeBdappsGateway();
  let app: INestApplication;
  let prisma: PrismaService;
  let restoreGate: () => Promise<void>;
  let http: ReturnType<typeof api>;

  beforeAll(async () => {
    configureBdappsEnvironment("https://gateway.invalid/api");
    const { AppModule } = await import("../src/app.module");
    const { configureApp } = await import("../src/app.bootstrap");
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BdappsGatewayClient)
      .useValue(gateway)
      .overrideProvider(AUTH_RATE_LIMITER)
      .useValue({
        consume: async () => ({ allowed: true, retryAfterSeconds: 0 }),
      })
      .compile();
    app = moduleRef.createNestApplication({ logger: false, rawBody: true });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    http = api(app);
    await cleanupPhones(prisma, Object.values(PHONES));
    await deleteCarrierPlan(prisma);
    await createCarrierPlan(prisma);
    restoreGate = await enableSubscriptionGate(prisma);
  });

  afterAll(async () => {
    await cleanupPhones(prisma, Object.values(PHONES));
    await deleteCarrierPlan(prisma);
    await restoreGate();
    await app.close();
    process.env = savedEnvironment;
  });

  async function register(phone: string) {
    const otp = await http.requestOtp(phone).expect(201);
    const verified = await http
      .verifyOtp(otp.body.data.challengeId, OTP, randomUUID())
      .expect(201);
    return verified.body.data.accessToken as string;
  }

  async function identity(phone: string) {
    return prisma.userOperatorIdentity.findFirstOrThrow({
      where: { user: { phone_e164: phone } },
    });
  }

  it("registers a new number via carrier OTP and grants access immediately", async () => {
    const token = await register(PHONES.fresh);
    const me = await http.me(token).expect(200);
    expect(me.body.data).toMatchObject({
      accessActive: true,
      cancelInstructions: {
        inApp: true,
        shortCode: "21213",
        smsKeyword: "STOP kaaj",
      },
      carrierStatus: "REGISTERED",
      current: { status: "ACTIVE", payment: { method: "OPERATOR_BILLING" } },
      operatorPlanMissing: false,
    });
    expect((await identity(PHONES.fresh)).provider_subscriber_id).toBe(
      `tel:${PHONES.fresh.slice(1)}`,
    );
    const payments = await prisma.subscriptionPayment.findMany({
      where: { user: { phone_e164: PHONES.fresh } },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      amount_poisha: 278n,
      provider_ref: "operator-confirmed",
      status: "PAID",
    });
  });

  it.each([
    ["E1850", 401, "OTP_INVALID"],
    ["E1851", 422, "OTP_EXPIRED"],
    ["E1852", 429, "OTP_ATTEMPTS_EXCEEDED"],
  ])(
    "maps carrier %s to HTTP %i %s (never 503)",
    async (statusCode, httpStatus, code) => {
      const otp = await http.requestOtp(PHONES.wrong).expect(201);
      gateway.verifyOverride = statusCode;
      try {
        const response = await http
          .verifyOtp(otp.body.data.challengeId, "000000", randomUUID())
          .expect(httpStatus);
        expect(response.body.error.code).toBe(code);
      } finally {
        gateway.verifyOverride = null;
      }
    },
  );

  it("falls back to a KAAJ SMS code for an already-subscribed number (new phone login)", async () => {
    gateway.subscribers.set(PHONES.subscribed.slice(1), "REGISTERED");
    const otp = await http.requestOtp(PHONES.subscribed).expect(201);
    const sent = gateway.sms.at(-1)!;
    expect(sent.subscriberId).toBe(`tel:${PHONES.subscribed.slice(1)}`);
    const verifyCalls = gateway.calls.filter(
      ([endpoint]) => endpoint === "otp_verify.php",
    ).length;
    await http
      .verifyOtp(otp.body.data.challengeId, "000000", randomUUID())
      .expect(401);
    const verified = await http
      .verifyOtp(
        otp.body.data.challengeId,
        codeFrom(sent.message),
        randomUUID(),
      )
      .expect(201);
    expect(
      gateway.calls.filter(([endpoint]) => endpoint === "otp_verify.php"),
    ).toHaveLength(verifyCalls);
    const me = await http.me(verified.body.data.accessToken).expect(200);
    expect(me.body.data.accessActive).toBe(true);
  });

  it("recovers a password for a subscribed number with the fallback code", async () => {
    const otp = await http.recoveryRequest(PHONES.subscribed).expect(201);
    const code = codeFrom(gateway.sms.at(-1)!.message);
    await http
      .recoveryVerify(
        otp.body.data.challengeId,
        code,
        "a long recovery passphrase",
      )
      .expect(201);
    await http
      .passwordLogin(
        PHONES.subscribed,
        "a long recovery passphrase",
        randomUUID(),
      )
      .expect(201);
  });

  it("returns OPERATOR_SMS_UNAVAILABLE when the fallback SMS fails", async () => {
    gateway.subscribers.set(PHONES.failing.slice(1), "REGISTERED");
    gateway.failSms = true;
    try {
      const response = await http.requestOtp(PHONES.failing).expect(503);
      expect(response.body.error.code).toBe("OPERATOR_SMS_UNAVAILABLE");
    } finally {
      gateway.failSms = false;
    }
  });

  it("stores masked ids and resolves webhooks by them (UNSUBSCRIBED, CHARGE_PENDING, REGISTERED)", async () => {
    gateway.mask = true;
    let token: string;
    try {
      token = await register(PHONES.masked);
    } finally {
      gateway.mask = false;
    }
    const masked = gateway.maskedId(PHONES.masked.slice(1));
    expect((await identity(PHONES.masked)).provider_subscriber_id).toBe(masked);

    await http
      .webhook({ status: "CHARGE_PENDING", subscriberId: masked })
      .expect(201);
    let me = await http.me(token).expect(200);
    expect(me.body.data).toMatchObject({
      accessActive: true,
      carrierStatus: "CHARGE_PENDING",
    });

    const unsubscribed = await http
      .webhook({ status: "UNSUBSCRIBED", subscriberId: masked })
      .expect(201);
    expect(unsubscribed.body.data).toEqual({ processed: true });
    me = await http.me(token).expect(200);
    expect(me.body.data.accessActive).toBe(false);

    await http
      .webhook({
        frequency: "daily",
        providerTimeStamp: "2611111200",
        status: "REGISTERED",
        subscriberId: masked,
      })
      .expect(201);
    me = await http.me(token).expect(200);
    expect(me.body.data).toMatchObject({
      accessActive: true,
      carrierStatus: "REGISTERED",
    });
  });

  it("rejects malformed or unsigned webhooks", async () => {
    await http
      .webhook({ status: "MAYBE", subscriberId: "tel:8801810009305" })
      .expect(400);
    await http.webhook({ status: "REGISTERED", subscriberId: "x" }).expect(400);
    await request(app.getHttpServer())
      .post("/api/v1/subscriptions/bdapps/webhook")
      .send({ status: "REGISTERED", subscriberId: "tel:8801810009305" })
      .expect(401);
  });

  it("cancels in-app: carrier unsubscribe first, then local access ends", async () => {
    const token = await register(PHONES.cancel);
    gateway.failUnsubscribe = true;
    try {
      const failed = await http.cancel(token).expect(503);
      expect(failed.body.error).toMatchObject({
        code: "OPERATOR_UNSUBSCRIBE_FAILED",
        details: [{ shortCode: "21213", smsKeyword: "STOP kaaj" }],
      });
      expect((await http.me(token).expect(200)).body.data.accessActive).toBe(
        true,
      );
    } finally {
      gateway.failUnsubscribe = false;
    }
    const cancelled = await http.cancel(token).expect(201);
    expect(cancelled.body.data).toMatchObject({
      accessActive: false,
      carrierStatus: "UNREGISTERED",
      current: { status: "CANCELLED" },
    });
    expect(gateway.calls.at(-1)).toEqual([
      "unsubscribe.php",
      { subscriberId: `tel:${PHONES.cancel.slice(1)}` },
    ]);
    expect(gateway.subscribers.get(PHONES.cancel.slice(1))).toBe(
      "UNREGISTERED",
    );
    expect((await identity(PHONES.cancel)).status).toBe("PENDING");
  });

  it("reports a missing carrier plan instead of inventing a subscription", async () => {
    await prisma.subscriptionPlan.updateMany({
      where: { code: process.env.BDAPPS_PLAN_CODE },
      data: { is_active: false },
    });
    try {
      const token = await register(PHONES.planless);
      const me = await http.me(token).expect(200);
      expect(me.body.data).toMatchObject({
        accessActive: false,
        carrierStatus: "REGISTERED",
        current: null,
        operatorPlanMissing: true,
      });
      // The carrier still bills, so in-app cancel must still stop it.
      const cancelled = await http.cancel(token).expect(201);
      expect(cancelled.body.data.carrierStatus).toBe("UNREGISTERED");
      expect(gateway.subscribers.get(PHONES.planless.slice(1))).toBe(
        "UNREGISTERED",
      );
      await http.cancel(token).expect(409);
    } finally {
      await prisma.subscriptionPlan.updateMany({
        where: { code: process.env.BDAPPS_PLAN_CODE },
        data: { is_active: true },
      });
    }
  });

  it("restores access through the feature gate when the carrier still reports REGISTERED", async () => {
    const user = await prisma.user.findUniqueOrThrow({
      where: { phone_e164: PHONES.fresh },
    });
    await prisma.subscription.updateMany({
      where: { user_id: user.id, status: "ACTIVE" },
      data: { expires_at: new Date(Date.now() - 1_000) },
    });
    await prisma.userOperatorIdentity.update({
      where: { user_id: user.id },
      data: { last_checked_at: new Date(Date.now() - 120_000) },
    });
    const { SubscriptionsService } =
      await import("../src/modules/subscriptions/subscriptions.service");
    const existingRule = await prisma.subscriptionAccessRule.findUnique({
      where: { feature_key: "JOB_POSTING" },
    });
    await prisma.subscriptionAccessRule.upsert({
      where: { feature_key: "JOB_POSTING" },
      create: {
        feature_key: "JOB_POSTING",
        is_active: true,
        requires_active_subscription: true,
      },
      update: { is_active: true, requires_active_subscription: true },
    });
    try {
      await expect(
        app.get(SubscriptionsService).accessFor(user.id, "JOB_POSTING"),
      ).resolves.toEqual({ allowed: true, gated: true });
    } finally {
      if (existingRule)
        await prisma.subscriptionAccessRule.update({
          where: { feature_key: "JOB_POSTING" },
          data: {
            is_active: existingRule.is_active,
            requires_active_subscription:
              existingRule.requires_active_subscription,
          },
        });
      else
        await prisma.subscriptionAccessRule.delete({
          where: { feature_key: "JOB_POSTING" },
        });
    }
  });
});
