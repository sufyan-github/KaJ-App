import "reflect-metadata";
import { RoleMode } from "@prisma/client";

import { BusinessOfferingsController } from "../src/modules/business/business-offerings.controller";
import { BusinessesController } from "../src/modules/business/businesses.controller";
import { CollaborationController } from "../src/modules/business/collaboration.controller";
import { IdeasController } from "../src/modules/ideas/ideas.controller";
import {
  moduleForFeature,
  SUBSCRIPTION_FEATURE_KEY,
} from "../src/modules/subscriptions/subscription-feature";
import { SubscriptionsService } from "../src/modules/subscriptions/subscriptions.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R1 add-on (owner decision, API-7): the Business module (businesses,
 * partners, collaboration, ideas) is free. Work stays paid; AI idea analysis
 * (P4, feature AI_IDEA_ANALYSIS) is not a Business feature key.
 */
databaseDescribe("the Business module is free (real HTTP)", () => {
  let api: HttpHarness;
  let unsubscribed: Actor;

  const setFlag = (key: string, on: boolean) =>
    api.db.featureFlag.upsert({
      where: { key },
      create: { key, is_enabled: on, rollout_percent: 100 },
      update: { is_enabled: on, rollout_percent: 100 },
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
    await setFlag("subscriptions_enabled", true);
    await setFlag("module_entitlements_enabled", true);
    unsubscribed = await api.actor([RoleMode.BUSINESS, RoleMode.CUSTOMER]);
  });

  afterAll(async () => {
    await setFlag("module_entitlements_enabled", false);
    await setFlag("subscriptions_enabled", false);
    await api?.close();
  });

  it("tells the app Business is free, Work is not", async () => {
    const me = await api.get("subscriptions/me", unsubscribed).expect(200);
    expect(me.body.data).toMatchObject({
      accessActive: false,
      freeModules: ["LEARN", "COMMUNITY", "BUSINESS"],
      moduleAccess: {
        WORK: false,
        BUSINESS: true,
        LEARN: true,
        COMMUNITY: true,
      },
    });
  });

  it("never gates a Business feature key, even with a rule asking for it", async () => {
    await api.db.subscriptionAccessRule.upsert({
      where: { feature_key: "BUSINESS_PROFILE" },
      create: {
        feature_key: "BUSINESS_PROFILE",
        requires_active_subscription: true,
        is_active: true,
        updated_at: new Date(),
      },
      update: { requires_active_subscription: true, is_active: true },
    });
    const service = api.app.get(SubscriptionsService);
    await expect(
      service.accessFor(unsubscribed.id, "BUSINESS_PROFILE"),
    ).resolves.toEqual({ allowed: true, gated: false });
    // P4's AI idea analysis is not a Business key, so it stays paid.
    expect(moduleForFeature("AI_IDEA_ANALYSIS")).toBe("WORK");
    await api.db.subscriptionAccessRule.delete({
      where: { feature_key: "BUSINESS_PROFILE" },
    });
  });

  it("puts no subscription gate on any Business route", () => {
    for (const controller of [
      BusinessesController,
      BusinessOfferingsController,
      CollaborationController,
      IdeasController,
    ]) {
      const prototype = controller.prototype as unknown as Record<
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
    }
  });

  it("lets a non-subscriber use businesses, partners, ideas and collaboration", async () => {
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    const area = await api.db.location.findFirstOrThrow({
      where: { type: "AREA", is_active: true },
    });
    const owner = await api.actor([RoleMode.BUSINESS]);
    const theirs = (
      await api
        .post("businesses", owner, {
          name: "Free module kitchen",
          categoryId: sector.id,
          locationId: area.id,
          isPublic: true,
          seekingPartners: true,
        })
        .expect(201)
    ).body.data.id;
    await api
      .post("businesses", unsubscribed, {
        name: "Free module shop",
        categoryId: sector.id,
        locationId: area.id,
      })
      .expect(201);
    await api.get("partners", unsubscribed).expect(200);
    await api
      .post("ideas", unsubscribed, {
        title: "Free module idea",
        summary: "An idea posted without a subscription.",
        problem: "Small shops can't afford a paid business tool.",
        solution: "Let them plan together for free.",
        categoryId: sector.id,
      })
      .expect(201);
    await api
      .post("collaboration-requests", unsubscribed, {
        subjectType: "BUSINESS",
        subjectId: theirs,
        message: "We could share deliveries in Rajshahi.",
      })
      .expect(201);
  });
});
