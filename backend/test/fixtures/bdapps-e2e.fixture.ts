import { createHmac, randomBytes } from "node:crypto";

import { INestApplication } from "@nestjs/common";
import request from "supertest";

import { PrismaService } from "../../src/infra/prisma/prisma.service";

/** Throwaway HMAC key for local test runs only. */
export const TEST_INTERNAL_KEY = randomBytes(24).toString("hex");
export const TEST_PLAN_CODE = `bdapps-e2e-${Date.now()}`;

/**
 * Must run before AppModule is imported: ConfigModule validates and caches the
 * environment when the module file is evaluated.
 */
export function configureBdappsEnvironment(gatewayUrl: string): void {
  Object.assign(process.env, {
    BDAPPS_GATEWAY_URL: gatewayUrl,
    BDAPPS_INTERNAL_API_KEY: TEST_INTERNAL_KEY,
    BDAPPS_PLAN_CODE: TEST_PLAN_CODE,
    OPERATOR_PROVIDER: "bdapps",
    OTP_FIXED_CODE: "",
    OTP_RESEND_COOLDOWN_SECONDS: "0",
    SMS_PROVIDER: "bdapps",
  });
}

export async function enableSubscriptionGate(prisma: PrismaService) {
  const previous = await prisma.featureFlag.findUnique({
    where: { key: "subscriptions_enabled" },
  });
  await prisma.featureFlag.upsert({
    where: { key: "subscriptions_enabled" },
    create: {
      key: "subscriptions_enabled",
      is_enabled: true,
      rollout_percent: 100,
    },
    update: { is_enabled: true, rollout_percent: 100 },
  });
  return async () => {
    if (!previous) {
      await prisma.featureFlag.deleteMany({
        where: { key: "subscriptions_enabled" },
      });
      return;
    }
    await prisma.featureFlag.update({
      where: { key: "subscriptions_enabled" },
      data: {
        is_enabled: previous.is_enabled,
        rollout_percent: previous.rollout_percent,
      },
    });
  };
}

export async function createCarrierPlan(prisma: PrismaService) {
  return prisma.subscriptionPlan.create({
    data: {
      code: TEST_PLAN_CODE,
      name_en: "Daily subscription",
      name_bn: "দৈনিক সাবস্ক্রিপশন",
      price_poisha: 278,
      currency: "BDT",
      duration_days: 1,
      feature_keys: [],
      is_active: true,
      sort_order: 999,
    },
  });
}

export async function cleanupPhones(prisma: PrismaService, phones: string[]) {
  const ids = (
    await prisma.user.findMany({
      where: { phone_e164: { in: phones } },
      select: { id: true },
    })
  ).map((user) => user.id);
  await prisma.subscriptionPayment.deleteMany({
    where: { user_id: { in: ids } },
  });
  await prisma.subscription.deleteMany({ where: { user_id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actor_user_id: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.otpChallenge.deleteMany({
    where: { phone_e164: { in: phones } },
  });
}

export async function deleteCarrierPlan(prisma: PrismaService) {
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: TEST_PLAN_CODE },
  });
  if (!plan) return;
  await prisma.subscriptionPayment.deleteMany({
    where: { subscription: { plan_id: plan.id } },
  });
  await prisma.subscription.deleteMany({ where: { plan_id: plan.id } });
  await prisma.subscriptionPlan.delete({ where: { id: plan.id } });
}

export function signWebhook(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1_000).toString();
  const nonce = randomBytes(16).toString("hex");
  return {
    headers: {
      "Content-Type": "application/json",
      "X-Nonce": nonce,
      "X-Signature": createHmac("sha256", TEST_INTERNAL_KEY)
        .update(raw + timestamp + nonce)
        .digest("hex"),
      "X-Timestamp": timestamp,
    },
    raw,
  };
}

export function api(app: INestApplication) {
  const server = app.getHttpServer();
  return {
    me: (token: string) =>
      request(server)
        .get("/api/v1/subscriptions/me")
        .auth(token, { type: "bearer" }),
    cancel: (token: string) =>
      request(server)
        .post("/api/v1/subscriptions/cancel")
        .auth(token, { type: "bearer" }),
    requestOtp: (phone: string) =>
      request(server).post("/api/v1/auth/otp/request").send({ phone }),
    verifyOtp: (challengeId: string, code: string, deviceId: string) =>
      request(server)
        .post("/api/v1/auth/otp/verify")
        .send({ challengeId, code, deviceId }),
    webhook: (body: Record<string, unknown>) => {
      const signed = signWebhook(body);
      return request(server)
        .post("/api/v1/subscriptions/bdapps/webhook")
        .set(signed.headers)
        .send(signed.raw);
    },
    recoveryRequest: (phone: string) =>
      request(server)
        .post("/api/v1/auth/password/recovery/request")
        .send({ phone, subscriptionConsent: true }),
    recoveryVerify: (challengeId: string, code: string, password: string) =>
      request(server).post("/api/v1/auth/password/recovery/verify").send({
        challengeId,
        code,
        password,
        subscriptionConsent: true,
      }),
    passwordLogin: (phone: string, password: string, deviceId: string) =>
      request(server)
        .post("/api/v1/auth/password/login")
        .send({ phone, password, deviceId }),
  };
}

export function codeFrom(message: string): string {
  const match = /\b(\d{6})\b/u.exec(message);
  if (!match) throw new Error("No code in SMS");
  return match[1]!;
}
