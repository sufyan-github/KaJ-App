import { randomUUID } from "node:crypto";
import { RoleMode, SubscriptionStatus } from "@prisma/client";

import { SUBSCRIPTION_FEATURE_KEY } from "../src/modules/subscriptions/subscription-feature";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";
import { TrainingController } from "../src/modules/training/training.controller";
import { HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.0: per-module entitlements. Learn is free; Work stays gated. */
databaseDescribe("module entitlements", () => {
  let api: HttpHarness;
  let service: SubscriptionsService;
  let narrowPlanId: string;
  let subscriber: string;
  let unsubscribed: string;

  const setFlag = (key: string, on: boolean) =>
    api.db.featureFlag.upsert({
      where: { key },
      create: { key, is_enabled: on, rollout_percent: 100 },
      update: { is_enabled: on, rollout_percent: 100 },
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
    service = api.app.get(SubscriptionsService);
    await setFlag("subscriptions_enabled", true);
    narrowPlanId = (
      await api.db.subscriptionPlan.create({
        data: {
          code: `apply-only-${randomUUID().slice(0, 8)}`,
          name_en: "Apply only",
          name_bn: "শুধু আবেদন",
          price_poisha: 100n,
          duration_days: 30,
          feature_keys: ["JOB_APPLICATION"],
        },
      })
    ).id;
    subscriber = (await api.actor([RoleMode.WORKER, RoleMode.CUSTOMER])).id;
    unsubscribed = (await api.actor([RoleMode.WORKER])).id;
    await api.db.subscription.create({
      data: {
        user_id: subscriber,
        plan_id: narrowPlanId,
        status: SubscriptionStatus.ACTIVE,
        starts_at: new Date(Date.now() - 86_400_000),
        expires_at: new Date(Date.now() + 10 * 86_400_000),
      },
    });
  });

  afterAll(async () => {
    await setFlag("module_entitlements_enabled", false);
    await setFlag("subscriptions_enabled", false);
    await api?.close();
  });

  it("keeps today's behaviour with the flag off: any active plan unlocks Work", async () => {
    await setFlag("module_entitlements_enabled", false);
    await expect(service.accessFor(subscriber, "JOB_POSTING")).resolves.toEqual(
      { allowed: true, gated: true },
    );
    await expect(
      service.accessFor(unsubscribed, "JOB_POSTING"),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("honours the plan's feature_keys with the flag on", async () => {
    await setFlag("module_entitlements_enabled", true);
    await expect(
      service.accessFor(subscriber, "JOB_APPLICATION"),
    ).resolves.toEqual({ allowed: true, gated: true });
    await expect(service.accessFor(subscriber, "JOB_POSTING")).resolves.toEqual(
      { allowed: false, gated: true },
    );
    // A plan with no feature keys still covers everything.
    await api.db.subscriptionPlan.update({
      where: { id: narrowPlanId },
      data: { feature_keys: [] },
    });
    await expect(
      service.accessFor(subscriber, "JOB_POSTING"),
    ).resolves.toMatchObject({ allowed: true });
    await api.db.subscriptionPlan.update({
      where: { id: narrowPlanId },
      data: { feature_keys: ["JOB_APPLICATION"] },
    });
    await setFlag("module_entitlements_enabled", false);
  });

  it("never gates Learn, even with a rule that asks for it", async () => {
    await api.db.subscriptionAccessRule.upsert({
      where: { feature_key: "LEARN_APPLICATION" },
      create: {
        feature_key: "LEARN_APPLICATION",
        requires_active_subscription: true,
        is_active: true,
        updated_at: new Date(),
      },
      update: { requires_active_subscription: true, is_active: true },
    });
    for (const on of [false, true]) {
      await setFlag("module_entitlements_enabled", on);
      await expect(
        service.accessFor(unsubscribed, "LEARN_APPLICATION"),
      ).resolves.toEqual({ allowed: true, gated: false });
    }
    await api.db.subscriptionAccessRule.delete({
      where: { feature_key: "LEARN_APPLICATION" },
    });
  });

  it("has no subscription gate on any training route", () => {
    const prototype = TrainingController.prototype as unknown as Record<
      string,
      unknown
    >;
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === "constructor") continue;
      expect(
        Reflect.getMetadata(
          SUBSCRIPTION_FEATURE_KEY,
          prototype[name] as object,
        ),
      ).toBeUndefined();
    }
  });
});
