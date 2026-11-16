import { ConfigService } from "@nestjs/config";

import { AuthService } from "../src/modules/auth/auth.service";
import {
  CARRIER_GRACE_MS,
  SubscriptionsService,
} from "../src/modules/subscriptions/subscriptions.service";

const USER = "0190a000-0000-7000-8000-000000000001";
const PHONE = "+8801812345678";
const MASKED = "tel:B%3C4ZyPUKdGq8w+/x=AbCdEf==";
const DAY = 86_400_000;

function harness() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    auditLog: { create: jest.fn() },
    subscription: {
      create: jest.fn().mockResolvedValue({ id: "sub-new" }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    subscriptionPayment: { create: jest.fn(), updateMany: jest.fn() },
    subscriptionPlan: { findFirst: jest.fn().mockResolvedValue(null) },
    userOperatorIdentity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: "PENDING", verified_at: null }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (work: unknown) =>
      typeof work === "function"
        ? (work as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(work as Promise<unknown>[]),
    ),
    featureFlag: { findUnique: jest.fn().mockResolvedValue(null) },
    mobileOperator: { findMany: jest.fn().mockResolvedValue([]) },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn(),
    },
    subscriptionAccessRule: {
      findUnique: jest.fn().mockResolvedValue({
        is_active: true,
        requires_active_subscription: true,
      }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: USER, phone_e164: PHONE }),
    },
    userOperatorIdentity: {
      findUnique: jest.fn().mockResolvedValue({
        last_checked_at: null,
        operator: { code: "ROBI" },
        operator_id: "op",
        provider_subscriber_id: null,
        status: "VERIFIED",
      }),
      upsert: jest.fn(),
    },
  };
  const operator = {
    cancelSubscription: jest.fn(),
    checkEligibility: jest.fn(),
    managesRemoteBilling: true,
  };
  const service = new SubscriptionsService(
    prisma as never,
    operator,
    new ConfigService({ BDAPPS_PLAN_CODE: "bdapps-daily" }),
  );
  return { operator, prisma, service, tx };
}

const carrierPlan = {
  code: "bdapps-daily",
  currency: "BDT",
  duration_days: 1,
  id: "plan-carrier",
  price_poisha: 278n,
};

describe("carrier-driven entitlement", () => {
  it("creates an ACTIVE carrier-plan subscription with one operator payment on first REGISTERED", async () => {
    const { service, tx } = harness();
    tx.subscriptionPlan.findFirst.mockResolvedValue(carrierPlan);
    const before = Date.now();

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "otp_verify",
      status: "REGISTERED",
      subscriberId: MASKED,
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.subscriptionPlan.findFirst).toHaveBeenCalledWith({
      where: { code: "bdapps-daily", is_active: true },
    });
    const created = tx.subscription.create.mock.calls[0][0].data;
    expect(created.status).toBe("ACTIVE");
    expect(created.expires_at.getTime()).toBeGreaterThanOrEqual(
      before + DAY + CARRIER_GRACE_MS,
    );
    expect(tx.subscriptionPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount_poisha: 278n,
        method: "OPERATOR_BILLING",
        provider_ref: "operator-confirmed",
        status: "PAID",
      }),
    });
    expect(tx.userOperatorIdentity.update).toHaveBeenCalledWith({
      where: { user_id: USER },
      data: expect.objectContaining({
        provider_status: "REGISTERED",
        provider_subscriber_id: MASKED,
        status: "VERIFIED",
      }),
    });
    // The id is released from any other account first.
    expect(tx.userOperatorIdentity.updateMany).toHaveBeenCalledWith({
      where: { provider_subscriber_id: MASKED, user_id: { not: USER } },
      data: { provider_subscriber_id: null },
    });
  });

  it("activates the newest PENDING request before creating anything", async () => {
    const { service, tx } = harness();
    tx.subscription.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "sub-pending", plan: { duration_days: 1 } });

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "status",
      status: "REGISTERED",
    });

    expect(tx.subscription.update).toHaveBeenCalledWith({
      where: { id: "sub-pending" },
      data: expect.objectContaining({ status: "ACTIVE" }),
    });
    expect(tx.subscription.create).not.toHaveBeenCalled();
  });

  it("extends a nearly-expired ACTIVE subscription with an audit row, never a payment", async () => {
    const { service, tx } = harness();
    const soon = new Date(Date.now() + 2 * 3_600_000);
    tx.subscription.findFirst.mockResolvedValueOnce({
      expires_at: soon,
      id: "sub-active",
      plan: { duration_days: 1 },
    });

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "status",
      status: "REGISTERED",
    });

    const update = tx.subscription.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: "sub-active" });
    expect(update.data.expires_at.getTime()).toBeGreaterThan(
      Date.now() + DAY + CARRIER_GRACE_MS - 5_000,
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "subscription.operator-renewed",
      }),
    });
    expect(tx.subscriptionPayment.create).not.toHaveBeenCalled();
    expect(tx.subscription.create).not.toHaveBeenCalled();
  });

  it("does not rewrite a subscription that still has a full period of cover", async () => {
    const { service, tx } = harness();
    tx.subscription.findFirst.mockResolvedValueOnce({
      expires_at: new Date(Date.now() + DAY + 3_600_000),
      id: "sub-active",
      plan: { duration_days: 1 },
    });

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "status",
      status: "REGISTERED",
    });

    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("creates nothing when the carrier plan is missing or inactive", async () => {
    const { service, tx } = harness();

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "webhook",
      status: "REGISTERED",
    });

    expect(tx.subscription.create).not.toHaveBeenCalled();
    expect(tx.subscriptionPayment.create).not.toHaveBeenCalled();
  });

  it("cancels ACTIVE access on UNREGISTERED", async () => {
    const { service, tx } = harness();
    tx.subscription.findMany.mockResolvedValue([{ id: "sub-active" }]);

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "webhook",
      status: "UNREGISTERED",
    });

    expect(tx.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["sub-active"] } },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
    expect(tx.userOperatorIdentity.update).toHaveBeenCalledWith({
      where: { user_id: USER },
      data: expect.objectContaining({
        provider_status: "UNREGISTERED",
        status: "PENDING",
        verified_at: null,
      }),
    });
  });

  it("keeps the entitlement untouched on CHARGE_PENDING", async () => {
    const { service, tx } = harness();

    await service.applyCarrierStatus(USER, {
      operatorCode: "ROBI",
      source: "webhook",
      status: "CHARGE_PENDING",
    });

    expect(tx.subscription.findFirst).not.toHaveBeenCalled();
    expect(tx.subscription.findMany).not.toHaveBeenCalled();
    expect(tx.subscription.update).not.toHaveBeenCalled();
    expect(tx.subscription.updateMany).not.toHaveBeenCalled();
    const data = tx.userOperatorIdentity.update.mock.calls[0][0].data;
    expect(data.provider_status).toBe("CHARGE_PENDING");
    expect(data.status).toBeUndefined();
  });

  it("resolves webhooks by the stored masked id first", async () => {
    const { prisma, service } = harness();
    prisma.userOperatorIdentity.findUnique
      .mockResolvedValueOnce({ user: { id: USER, phone_e164: PHONE } })
      .mockResolvedValue({
        operator: { code: "ROBI" },
        operator_id: "op",
        provider_subscriber_id: MASKED,
        status: "VERIFIED",
      });
    const apply = jest
      .spyOn(service, "applyCarrierStatus")
      .mockResolvedValue(undefined);

    await expect(
      service.applyBdappsWebhook({
        providerEventId: "bdapps-1",
        status: "UNSUBSCRIBED",
        subscriberId: MASKED,
      }),
    ).resolves.toEqual({ processed: true });

    expect(prisma.userOperatorIdentity.findUnique).toHaveBeenNthCalledWith(1, {
      where: { provider_subscriber_id: MASKED },
      select: { user: { select: { id: true, phone_e164: true } } },
    });
    expect(apply).toHaveBeenCalledWith(USER, {
      operatorCode: "ROBI",
      providerReference: "bdapps-1",
      source: "webhook",
      status: "UNREGISTERED",
      subscriberId: undefined,
    });
  });

  it("ignores an unknown masked id instead of failing", async () => {
    const { prisma, service } = harness();
    prisma.userOperatorIdentity.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.applyBdappsWebhook({
        providerEventId: null,
        status: "REGISTERED",
        subscriberId: MASKED,
      }),
    ).resolves.toEqual({ processed: false });
  });

  it("re-checks the carrier from the feature gate when no subscription is active", async () => {
    const { operator, prisma, service } = harness();
    // Only the subscription gate is on (not module entitlements).
    prisma.featureFlag.findUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) =>
        where.key === "subscriptions_enabled"
          ? { is_enabled: true, rollout_percent: 100 }
          : null,
    );
    operator.checkEligibility.mockResolvedValue({
      carrierStatus: "REGISTERED",
      operatorCode: "ROBI",
      providerReference: null,
      status: "VERIFIED",
    });
    const apply = jest
      .spyOn(service, "applyCarrierStatus")
      .mockImplementation(async () => {
        prisma.subscription.findFirst.mockResolvedValue({ id: "renewed" });
      });

    await expect(service.accessFor(USER, "JOB_POSTING")).resolves.toEqual({
      allowed: true,
      gated: true,
    });
    expect(operator.checkEligibility).toHaveBeenCalledWith({
      operatorCode: "ROBI",
      phoneE164: PHONE,
      subscriberId: null,
    });
    expect(apply).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ source: "status", status: "REGISTERED" }),
    );
  });

  it("does not poll the carrier from the gate within the 60 s throttle", async () => {
    const { operator, prisma, service } = harness();
    // Only the subscription gate is on (not module entitlements).
    prisma.featureFlag.findUnique.mockImplementation(
      async ({ where }: { where: { key: string } }) =>
        where.key === "subscriptions_enabled"
          ? { is_enabled: true, rollout_percent: 100 }
          : null,
    );
    prisma.userOperatorIdentity.findUnique.mockResolvedValue({
      last_checked_at: new Date(),
      operator: { code: "ROBI" },
      operator_id: "op",
      provider_subscriber_id: null,
      status: "VERIFIED",
    });
    await expect(service.accessFor(USER, "JOB_POSTING")).resolves.toEqual({
      allowed: false,
      gated: true,
    });
    expect(operator.checkEligibility).not.toHaveBeenCalled();
  });

  it("stops carrier billing, then cancels locally and records UNREGISTERED", async () => {
    const { operator, prisma, service } = harness();
    prisma.subscription.findFirst.mockResolvedValueOnce({
      id: "sub-active",
      status: "ACTIVE",
    });
    prisma.userOperatorIdentity.findUnique.mockResolvedValue({
      last_checked_at: new Date(),
      operator: { code: "ROBI" },
      operator_id: "op",
      provider_subscriber_id: MASKED,
      status: "VERIFIED",
    });
    operator.cancelSubscription.mockResolvedValue({
      carrierStatus: "UNREGISTERED",
    });
    const apply = jest
      .spyOn(service, "applyCarrierStatus")
      .mockResolvedValue(undefined);
    jest.spyOn(service, "mine").mockResolvedValue({ ok: true } as never);
    const prismaWithBatch = prisma as unknown as {
      subscriptionPayment: { updateMany: jest.Mock };
    };
    prismaWithBatch.subscriptionPayment = { updateMany: jest.fn() };

    await expect(service.cancel(USER)).resolves.toEqual({ ok: true });
    expect(operator.cancelSubscription).toHaveBeenCalledWith({
      phoneE164: PHONE,
      subscriberId: MASKED,
    });
    expect(apply).toHaveBeenCalledWith(USER, {
      operatorCode: "ROBI",
      source: "cancel",
      status: "UNREGISTERED",
    });
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
  });
});

describe("carrier OTP verification in AuthService", () => {
  function authHarness(verification: unknown) {
    const repository = {
      consumeChallengeAndCreateSession: jest.fn().mockResolvedValue({
        isNewUser: true,
        user: { id: USER, status: "ACTIVE" },
      }),
      findOtpChallenge: jest.fn().mockResolvedValue({
        attempts: 0,
        codeHash: "unused",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 300_000),
        id: "challenge",
        phoneE164: PHONE,
        purpose: "LOGIN",
      }),
      incrementOtpAttempts: jest.fn().mockResolvedValue(true),
      revokeRefreshFamily: jest.fn(),
    };
    const subscriptions = { onCarrierVerified: jest.fn() };
    const tokens = {
      createAccessToken: jest.fn().mockResolvedValue("access"),
      createRefreshToken: jest.fn().mockReturnValue({
        record: { familyId: "family" },
        token: "refresh",
      }),
    };
    const service = new AuthService(
      repository as never,
      { consume: jest.fn() } as never,
      {
        sendOtp: jest.fn(),
        verifyOtp: jest.fn().mockResolvedValue(verification),
      },
      { generate: () => "123456" },
      { now: () => new Date() } as never,
      new ConfigService({}),
      tokens as never,
      subscriptions as never,
    );
    return { repository, service, subscriptions };
  }

  it.each([
    [{ valid: false, failure: "expired" }, "OTP_EXPIRED"],
    [{ valid: false, failure: "attempts_exceeded" }, "OTP_ATTEMPTS_EXCEEDED"],
    [{ valid: false, failure: "invalid" }, "OTP_INVALID"],
    [{ valid: false }, "OTP_INVALID"],
  ])("maps %p to %s", async (verification, code) => {
    const { service } = authHarness(verification);
    await expect(
      service.verifyOtp("challenge", "000000", "device"),
    ).rejects.toMatchObject({ descriptor: { code } });
  });

  it("grants carrier entitlement after the session is created", async () => {
    const carrier = { subscriberId: MASKED, subscriptionStatus: "REGISTERED" };
    const { service, subscriptions } = authHarness({ carrier, valid: true });
    await expect(
      service.verifyOtp("challenge", "123456", "device"),
    ).resolves.toMatchObject({ accessToken: "access", isNewUser: true });
    expect(subscriptions.onCarrierVerified).toHaveBeenCalledWith(
      USER,
      PHONE,
      carrier,
    );
  });

  it("never fails login when the entitlement sync fails", async () => {
    const { service, subscriptions } = authHarness({
      carrier: { subscriberId: MASKED, subscriptionStatus: "REGISTERED" },
      valid: true,
    });
    subscriptions.onCarrierVerified.mockRejectedValue(new Error("db down"));
    await expect(
      service.verifyOtp("challenge", "123456", "device"),
    ).resolves.toMatchObject({ accessToken: "access" });
  });
});
