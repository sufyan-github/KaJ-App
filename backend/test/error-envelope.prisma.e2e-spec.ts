import { ModerationLevel, RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * Every error the app can act on reaches it with its own code, message and
 * messageKey through the real HTTP stack (guards, pipes, filter).
 */
databaseDescribe("error envelope over HTTP", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let jobId: string;
  const { startsAt, endsAt } = futureSlot(4);

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    const location = await api.db.location.findFirstOrThrow({
      where: { is_active: true },
    });
    const created = await api
      .post("jobs", poster, {
        title: "Error envelope test job",
        description: "A synthetic job used only by the error envelope test.",
        categoryId: category.id,
        skillIds: [],
        locationId: location.id,
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "10000",
        budgetMaxPoisha: "20000",
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      })
      .expect(201);
    jobId = created.body.data.id;
    await api.post(`jobs/${jobId}/publish`, poster).expect(201);
  });

  afterAll(async () => {
    await api?.db.featureFlag.updateMany({
      where: { key: "subscriptions_enabled" },
      data: { is_enabled: false },
    });
    await api?.close();
  });

  function expectEnvelope(body: { error: Record<string, unknown> }) {
    expect(body.error).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        message: expect.any(String),
        messageKey: expect.stringMatching(/^error\./),
        requestId: expect.any(String),
        retryable: expect.any(Boolean),
      }),
    );
  }

  it("tells a restricted user ACCOUNT_RESTRICTED", async () => {
    const restricted = await api.actor([RoleMode.CUSTOMER], {
      moderationLevel: ModerationLevel.RESTRICT,
    });
    // Reads still work.
    await api.get("jobs", restricted).expect(200);
    const response = await api.post("jobs", restricted, {}).expect(403);
    expectEnvelope(response.body);
    expect(response.body.error).toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "Marketplace actions are temporarily restricted.",
      messageKey: "error.account.restricted",
    });
  });

  it("tells a user awaiting re-verification REVERIFICATION_REQUIRED", async () => {
    const pending = await api.actor([RoleMode.WORKER], {
      reverificationRequired: true,
    });
    const response = await api
      .post(`jobs/${jobId}/applications`, pending, {})
      .expect(403);
    expect(response.body.error).toMatchObject({
      code: "REVERIFICATION_REQUIRED",
      messageKey: "error.account.reverification_required",
    });
  });

  it("tells an unsubscribed user SUBSCRIPTION_REQUIRED", async () => {
    await api.db.featureFlag.upsert({
      where: { key: "subscriptions_enabled" },
      create: {
        key: "subscriptions_enabled",
        is_enabled: true,
        rollout_percent: 100,
      },
      update: { is_enabled: true, rollout_percent: 100 },
    });
    try {
      const response = await api
        .post(`jobs/${jobId}/applications`, worker, {
          proposedStartsAt: startsAt.toISOString(),
          proposedEndsAt: endsAt.toISOString(),
        })
        .expect(403);
      expectEnvelope(response.body);
      expect(response.body.error).toMatchObject({
        code: "SUBSCRIPTION_REQUIRED",
        field: "subscription",
        messageKey: "error.subscription.required",
      });
    } finally {
      await api.db.featureFlag.update({
        where: { key: "subscriptions_enabled" },
        data: { is_enabled: false },
      });
    }
  });

  it("tells a worker who applies twice ALREADY_APPLIED", async () => {
    const body = {
      message: "I can do this job on time.",
      proposedPricePoisha: "15000",
      proposedStartsAt: startsAt.toISOString(),
      proposedEndsAt: endsAt.toISOString(),
    };
    await api.post(`jobs/${jobId}/applications`, worker, body).expect(201);
    const response = await api
      .post(`jobs/${jobId}/applications`, worker, body)
      .expect(409);
    expectEnvelope(response.body);
    expect(response.body.error).toMatchObject({
      code: "ALREADY_APPLIED",
      message: "You have already applied to this job.",
      messageKey: "error.jobs.already_applied",
    });
  });

  it("keeps a plain business-rule message with the status-level code", async () => {
    // Publishing an already published job is a plain ConflictException.
    const response = await api
      .post(`jobs/${jobId}/publish`, poster)
      .expect(409);
    expect(response.body.error).toMatchObject({
      code: "CONFLICT",
      message: "Only draft jobs can be published.",
      messageKey: "error.common.conflict",
    });
  });

  it("keeps the message of Nest's built-in pipes", async () => {
    const response = await api.get("jobs/not-a-uuid", poster).expect(400);
    expectEnvelope(response.body);
    expect(response.body.error).toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("uuid"),
    });
  });

  it("uses field-level validation errors for bad bodies", async () => {
    const response = await api
      .post("jobs", poster, { title: "x", unknownField: true })
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "error.validation.failed",
    });
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        { field: "title", rules: expect.arrayContaining(["minLength"]) },
        { field: "unknownField", rules: ["whitelistValidation"] },
      ]),
    );
  });

  it("answers unknown routes with the generic NOT_FOUND", async () => {
    const response = await api.get("no-such-route", poster).expect(404);
    expect(response.body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Resource not found.",
    });
  });

  it("answers a missing token with an auth error envelope", async () => {
    const response = await api.get("jobs").expect(401);
    expectEnvelope(response.body);
  });
});
