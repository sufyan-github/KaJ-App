import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { compare, hash } from "bcryptjs";
import request from "supertest";
import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { SMS_PORT } from "../src/infra/sms/sms.port";
import { OPERATOR_PORT } from "../src/infra/operator/operator.port";
import { AUTH_RATE_LIMITER } from "../src/modules/auth/auth-rate-limiter";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";

const PHONE = "+8801810009191"; // Synthetic; every external provider is mocked.
const PASSWORD = "a unique passphrase 123";
const NEXT_PASSWORD = "a different passphrase 456";
const DEVICE = randomUUID();
const CODE = "123456";
const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe(
  "mobile password authentication without billing mutations",
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let userId: string;
    let planId: string;
    let previousGate: boolean | undefined;
    let previousRollout = 0;
    let storedHash: string;
    const sms = {
      sendOtp: jest.fn(async () => undefined),
      verifyOtp: jest.fn(async () => ({ valid: true })),
    };
    const operator = {
      managesRemoteBilling: false,
      checkEligibility: jest.fn(async () => ({
        status: "VERIFIED",
        operatorCode: "ROBI",
        providerReference: "test-only",
      })),
    };
    const limiter = {
      consume: jest.fn(async () => ({ allowed: true, retryAfterSeconds: 1 })),
    };

    beforeAll(async () => {
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(SMS_PORT)
        .useValue(sms)
        .overrideProvider(OPERATOR_PORT)
        .useValue(operator)
        .overrideProvider(AUTH_RATE_LIMITER)
        .useValue(limiter)
        .compile();
      app = module.createNestApplication({ logger: false });
      configureApp(app);
      await app.listen(0, "127.0.0.1");
      prisma = app.get(PrismaService);
      storedHash = await hash(PASSWORD, 12);
      previousGate = (
        await prisma.featureFlag.findUnique({
          where: { key: "subscriptions_enabled" },
        })
      )?.is_enabled;
      previousRollout =
        (
          await prisma.featureFlag.findUnique({
            where: { key: "subscriptions_enabled" },
          })
        )?.rollout_percent ?? 0;
      planId = (
        await prisma.subscriptionPlan.create({
          data: {
            code: `PASSWORD_TEST_${Date.now()}`,
            name_en: "Test only",
            name_bn: "পরীক্ষা",
            price_poisha: 278,
            duration_days: 1,
            feature_keys: [],
            is_active: true,
          },
        })
      ).id;
    });
    beforeEach(async () => {
      sms.sendOtp.mockClear();
      sms.verifyOtp.mockReset().mockResolvedValue({ valid: true });
      operator.checkEligibility.mockClear();
      limiter.consume
        .mockReset()
        .mockResolvedValue({ allowed: true, retryAfterSeconds: 1 });
      await cleanup();
      userId = (
        await prisma.user.create({
          data: {
            phone_e164: PHONE,
            mobile_password_hash: storedHash,
            password_hash: "unchanged-admin-hash",
          },
        })
      ).id;
      await prisma.featureFlag.upsert({
        where: { key: "subscriptions_enabled" },
        create: {
          key: "subscriptions_enabled",
          is_enabled: true,
          rollout_percent: 100,
        },
        update: { is_enabled: true, rollout_percent: 100 },
      });
    });
    afterAll(async () => {
      await cleanup();
      await prisma.subscriptionPlan.delete({ where: { id: planId } });
      if (previousGate === undefined)
        await prisma.featureFlag.deleteMany({
          where: { key: "subscriptions_enabled" },
        });
      else
        await prisma.featureFlag.update({
          where: { key: "subscriptions_enabled" },
          data: { is_enabled: previousGate, rollout_percent: previousRollout },
        });
      await app.close();
    });
    async function cleanup() {
      const ids = (
        await prisma.user.findMany({
          where: { phone_e164: PHONE },
          select: { id: true },
        })
      ).map((u) => u.id);
      await prisma.subscriptionPayment.deleteMany({
        where: { user_id: { in: ids } },
      });
      await prisma.subscription.deleteMany({ where: { user_id: { in: ids } } });
      await prisma.auditLog.deleteMany({
        where: { actor_user_id: { in: ids } },
      });
      await prisma.user.deleteMany({ where: { id: { in: ids } } });
      await prisma.otpChallenge.deleteMany({ where: { phone_e164: PHONE } });
    }
    function login(deviceId = DEVICE, password = PASSWORD, phone = PHONE) {
      return request(app.getHttpServer())
        .post("/api/v1/auth/password/login")
        .send({ phone, password, deviceId });
    }
    async function activate() {
      return app
        .get(SubscriptionsService)
        .request(userId, { planId, operatorCode: "ROBI" });
    }
    async function recovery() {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/password/recovery/request")
        .send({ phone: PHONE, subscriptionConsent: true })
        .expect(201);
      return response.body.data.challengeId as string;
    }
    function reset(id: string, extra: Record<string, unknown> = {}) {
      return request(app.getHttpServer())
        .post("/api/v1/auth/password/recovery/verify")
        .send({
          challengeId: id,
          code: CODE,
          password: NEXT_PASSWORD,
          subscriptionConsent: true,
          ...extra,
        });
    }

    it("repeated login and a second device preserve users, subscriptions, payments and expiry without OTP", async () => {
      await activate();
      const before = await prisma.subscription.findMany({
        where: { user_id: userId },
        include: { payments: true },
      });
      const calls = operator.checkEligibility.mock.calls.length;
      for (const device of [DEVICE, DEVICE, randomUUID()]) {
        const response = await login(device).expect(201);
        await request(app.getHttpServer())
          .get("/api/v1/auth/session")
          .auth(response.body.data.accessToken, { type: "bearer" })
          .expect(200);
      }
      expect(await prisma.user.count({ where: { phone_e164: PHONE } })).toBe(1);
      expect(
        await prisma.subscription.findMany({
          where: { user_id: userId },
          include: { payments: true },
        }),
      ).toEqual(before);
      expect(sms.sendOtp).not.toHaveBeenCalled();
      expect(sms.verifyOtp).not.toHaveBeenCalled();
      expect(operator.checkEligibility).toHaveBeenCalledTimes(calls);
    });

    it.each(["EXPIRED", "CANCELLED", "INACTIVE"])(
      "authenticates %s subscribers without clearing credentials",
      async (status) => {
        if (status !== "INACTIVE") {
          await activate();
          await prisma.subscription.updateMany({
            where: { user_id: userId },
            data: { status: status as "EXPIRED" | "CANCELLED" },
          });
        }
        const response = await login().expect(201);
        const overview = await request(app.getHttpServer())
          .get("/api/v1/subscriptions/me")
          .auth(response.body.data.accessToken, { type: "bearer" })
          .expect(200);
        expect(overview.body.data.accessActive).toBe(false);
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
            .mobile_password_hash,
        ).toBe(storedHash);
        expect(sms.sendOtp).not.toHaveBeenCalled();
      },
    );

    it("existing renewal restores access to the same account and retains subscription history", async () => {
      await activate();
      await prisma.subscription.updateMany({
        where: { user_id: userId },
        data: { status: "CANCELLED" },
      });
      const response = await login().expect(201);
      await request(app.getHttpServer())
        .post("/api/v1/subscriptions/request")
        .auth(response.body.data.accessToken, { type: "bearer" })
        .send({ planId, operatorCode: "ROBI" })
        .expect(201);
      const overview = await request(app.getHttpServer())
        .get("/api/v1/subscriptions/me")
        .auth(response.body.data.accessToken, { type: "bearer" })
        .expect(200);
      expect(overview.body.data.accessActive).toBe(true);
      expect(
        await prisma.subscription.count({ where: { user_id: userId } }),
      ).toBe(2);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
          .mobile_password_hash,
      ).toBe(storedHash);
      expect(await prisma.user.count({ where: { phone_e164: PHONE } })).toBe(1);
    });

    it("new OTP account sets password only after existing activation; cannot overwrite it", async () => {
      await cleanup();
      const otp = await request(app.getHttpServer())
        .post("/api/v1/auth/otp/request")
        .send({ phone: PHONE })
        .expect(201);
      const verified = await request(app.getHttpServer())
        .post("/api/v1/auth/otp/verify")
        .send({
          challengeId: otp.body.data.challengeId,
          code: CODE,
          deviceId: DEVICE,
        })
        .expect(201);
      userId = (
        await prisma.user.findUniqueOrThrow({ where: { phone_e164: PHONE } })
      ).id;
      expect(verified.body.data.isNewUser).toBe(true);
      const setup = () =>
        request(app.getHttpServer())
          .post("/api/v1/auth/password/setup")
          .auth(verified.body.data.accessToken, { type: "bearer" })
          .send({ password: PASSWORD });
      await setup().expect(403);
      await activate();
      await setup().expect(201);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(user.mobile_password_hash).not.toBe(PASSWORD);
      expect(await compare(PASSWORD, user.mobile_password_hash!)).toBe(true);
      await setup().expect(409);
      await login().expect(201);
    });

    it("password reset uses only recovery OTP and invalidates every previous token", async () => {
      const first = await login().expect(201);
      const second = await login(randomUUID()).expect(201);
      const id = await recovery();
      await request(app.getHttpServer())
        .post("/api/v1/auth/otp/verify")
        .send({ challengeId: id, code: CODE, deviceId: DEVICE })
        .expect(404);
      expect(sms.verifyOtp).not.toHaveBeenCalled();
      await reset(id).expect(201);
      expect(sms.verifyOtp).toHaveBeenCalledTimes(1);
      await reset(id).expect(401);
      expect(sms.verifyOtp).toHaveBeenCalledTimes(1);
      await login().expect(401);
      await login(DEVICE, NEXT_PASSWORD).expect(201);
      for (const session of [first, second]) {
        await request(app.getHttpServer())
          .post("/api/v1/auth/refresh")
          .send({ refreshToken: session.body.data.refreshToken })
          .expect(401);
        await request(app.getHttpServer())
          .get("/api/v1/auth/session")
          .auth(session.body.data.accessToken, { type: "bearer" })
          .expect(401);
      }
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
          .password_hash,
      ).toBe("unchanged-admin-hash");
      expect(
        await prisma.subscription.count({ where: { user_id: userId } }),
      ).toBe(0);
      expect(
        await prisma.subscriptionPayment.count({ where: { user_id: userId } }),
      ).toBe(0);
    });

    it("requires recovery consent at both endpoints", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/auth/password/recovery/request")
        .send({ phone: PHONE })
        .expect(400);
      expect(sms.sendOtp).not.toHaveBeenCalled();
      const id = await recovery();
      await reset(id, { subscriptionConsent: false }).expect(400);
      expect(sms.verifyOtp).not.toHaveBeenCalled();
    });

    it("rejects expired and login-purpose challenges without contacting carrier", async () => {
      const id = await recovery();
      await prisma.otpChallenge.update({
        where: { id },
        data: { expires_at: new Date(0) },
      });
      await reset(id).expect(401);
      await prisma.otpChallenge.update({
        where: { id },
        data: { purpose: "LOGIN", expires_at: new Date(Date.now() + 300000) },
      });
      await reset(id).expect(401);
      expect(sms.verifyOtp).not.toHaveBeenCalled();
    });

    it("bounds wrong codes and rejects concurrent replay before the provider call", async () => {
      const id = await recovery();
      sms.verifyOtp.mockResolvedValue({ valid: false });
      for (let i = 0; i < 5; i++) await reset(id).expect(401);
      await reset(id).expect(401);
      expect(sms.verifyOtp).toHaveBeenCalledTimes(5);
      const next = await recovery();
      sms.verifyOtp.mockReset().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return { valid: true };
      });
      const responses = await Promise.all([reset(next), reset(next)]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 401]);
      expect(sms.verifyOtp).toHaveBeenCalledTimes(1);
    });

    it("does not retry an uncertain paid verification automatically", async () => {
      const id = await recovery();
      sms.verifyOtp.mockRejectedValue(new Error("provider timeout"));
      await reset(id).expect(500);
      await reset(id).expect(401);
      expect(sms.verifyOtp).toHaveBeenCalledTimes(1);
    });

    it("returns generic credentials errors, enforces limits and never creates unknown accounts", async () => {
      const unknown = await login(DEVICE, PASSWORD, "+8801810009192").expect(
        401,
      );
      const wrong = await login(DEVICE, "incorrect password").expect(401);
      expect(unknown.body.error.code).toBe(wrong.body.error.code);
      const before = await prisma.user.count();
      await request(app.getHttpServer())
        .post("/api/v1/auth/password/recovery/request")
        .send({ phone: "+8801810009192", subscriptionConsent: true })
        .expect(201);
      expect(await prisma.user.count()).toBe(before);
      expect(sms.sendOtp).not.toHaveBeenCalled();
      limiter.consume.mockResolvedValue({
        allowed: false,
        retryAfterSeconds: 900,
      });
      await login().expect(429);
    });

    it("rejects blocked accounts and overlong UTF-8 passwords", async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { status: "BANNED" },
      });
      await login().expect(401);
      await login(DEVICE, "অ".repeat(30)).expect(401);
    });

    it("preserves the existing pilot access flag without treating it as payment proof", async () => {
      await prisma.featureFlag.update({
        where: { key: "subscriptions_enabled" },
        data: { is_enabled: false },
      });
      const response = await login().expect(201);
      const overview = await request(app.getHttpServer())
        .get("/api/v1/subscriptions/me")
        .auth(response.body.data.accessToken, { type: "bearer" })
        .expect(200);
      expect(overview.body.data.accessActive).toBe(true);
      expect(overview.body.data.gateEnabled).toBe(false);
      await prisma.user.update({
        where: { id: userId },
        data: { mobile_password_hash: null },
      });
      await request(app.getHttpServer())
        .post("/api/v1/auth/password/setup")
        .auth(response.body.data.accessToken, { type: "bearer" })
        .send({ password: PASSWORD })
        .expect(403);
    });
  },
);
