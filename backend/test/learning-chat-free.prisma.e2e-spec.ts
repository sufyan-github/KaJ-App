import { MentorStatus, RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W3: Learn is free, so a learner without a subscription can message
 * the mentor about a learning opportunity. Starting a conversation about
 * paid work still needs the direct-contact entitlement.
 */
databaseDescribe("learning conversations are free (real HTTP)", () => {
  let api: HttpHarness;
  let restoreRule: {
    is_active: boolean;
    requires_active_subscription: boolean;
  } | null;

  const setGate = (on: boolean) =>
    api.db.featureFlag.upsert({
      where: { key: "subscriptions_enabled" },
      create: {
        key: "subscriptions_enabled",
        is_enabled: on,
        rollout_percent: 100,
      },
      update: { is_enabled: on, rollout_percent: 100 },
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
    restoreRule = await api.db.subscriptionAccessRule.findUnique({
      where: { feature_key: "DIRECT_CONTACT" },
      select: { is_active: true, requires_active_subscription: true },
    });
    await api.db.subscriptionAccessRule.upsert({
      where: { feature_key: "DIRECT_CONTACT" },
      create: {
        feature_key: "DIRECT_CONTACT",
        is_active: true,
        requires_active_subscription: true,
        updated_at: new Date(),
      },
      update: { is_active: true, requires_active_subscription: true },
    });
  });

  afterAll(async () => {
    await setGate(false);
    if (restoreRule)
      await api.db.subscriptionAccessRule.update({
        where: { feature_key: "DIRECT_CONTACT" },
        data: restoreRule,
      });
    await api?.close();
  });

  it("lets an unsubscribed learner message the mentor, but not open paid-work chat", async () => {
    const slot = futureSlot(16);
    const mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    const learner = await api.actor([RoleMode.WORKER]);
    const [category, location] = await Promise.all([
      api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      }),
      api.db.location.findFirstOrThrow({ where: { is_active: true } }),
    ]);
    const opportunityId = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title: "Free chat training",
          description: "A training used only by the learning-chat test.",
          categoryId: category.id,
          skillIds: [],
          locationId: location.id,
          participantTerms: "FREE",
          seats: 3,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-opportunities/${opportunityId}/publish`, mentor)
      .expect(201);
    await api
      .post(`learning-opportunities/${opportunityId}/applications`, learner)
      .expect(201);

    const poster = await api.actor([RoleMode.CUSTOMER]);
    const jobId = (
      await api
        .post("jobs", poster, {
          title: "Paid work chat job",
          description: "A paid job used only by the learning-chat test.",
          categoryId: category.id,
          skillIds: [
            (
              await api.db.skill.findFirstOrThrow({
                where: { category_id: category.id, is_active: true },
              })
            ).id,
          ],
          locationId: location.id,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })
        .expect(201)
    ).body.data.id;
    await api.db.application.create({
      data: { job_id: jobId, worker_user_id: learner.id },
    });

    await setGate(true);
    await api
      .post(`jobs/${opportunityId}/conversations`, learner, {
        participantUserId: mentor.id,
      })
      .expect(201);
    const paid = await api
      .post(`jobs/${jobId}/conversations`, learner, {
        participantUserId: poster.id,
      })
      .expect(403);
    expect(paid.body.error.code).toBe("SUBSCRIPTION_REQUIRED");
  });
});
