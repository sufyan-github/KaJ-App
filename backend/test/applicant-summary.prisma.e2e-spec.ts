import { RoleMode, TrustLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("applicant summary on GET /jobs/:id/applications", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let jobId: string;
  const slot = futureSlot(7);

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER], {
      displayName: "Rahima Khatun",
      trust: TrustLevel.IDENTITY,
    });
    await api.db.workerProfile.update({
      where: { user_id: worker.id },
      data: { rating_avg: 4.5, rating_count: 12, completed_jobs_count: 9 },
    });
    const badge = await api.db.badge.findFirst({ where: { slug: "verified" } });
    if (badge)
      await api.db.userBadge.create({
        data: { user_id: worker.id, badge_id: badge.id },
      });
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    const location = await api.db.location.findFirstOrThrow({
      where: { is_active: true },
    });
    const job = await api
      .post("jobs", poster, {
        title: "Applicant summary test job",
        description: "A synthetic job used only by the applicant summary test.",
        categoryId: category.id,
        skillIds: [],
        locationId: location.id,
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "10000",
        budgetMaxPoisha: "20000",
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    jobId = job.body.data.id;
    await api.post(`jobs/${jobId}/publish`, poster).expect(201);
    await api
      .post(`jobs/${jobId}/applications`, worker, {
        message: "I have done this many times.",
        proposedPricePoisha: "17500",
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("returns name, rating, verification, price and the worker id for the profile link", async () => {
    const response = await api
      .get(`jobs/${jobId}/applications`, poster)
      .expect(200);
    const [item] = response.body.data.items;
    expect(item).toMatchObject({
      // Existing fields are unchanged.
      workerUserId: worker.id,
      proposedPricePoisha: "17500",
      message: "I have done this many times.",
      status: "PENDING",
      applicant: {
        userId: worker.id,
        displayName: "Rahima K.",
        trustLevel: "IDENTITY",
        isVerified: true,
        ratingAverage: "4.5",
        ratingCount: 12,
        completedJobsCount: 9,
      },
    });
    expect(Array.isArray(item.applicant.badges)).toBe(true);
    // The profile link resolves.
    await api.get(`users/${item.applicant.userId}/public`, poster).expect(200);
  });

  it("does not mark a phone-only worker as verified", async () => {
    await api.db.profile.update({
      where: { user_id: worker.id },
      data: { trust_level: TrustLevel.PHONE },
    });
    const response = await api
      .get(`jobs/${jobId}/applications`, poster)
      .expect(200);
    expect(response.body.data.items[0].applicant).toMatchObject({
      trustLevel: "PHONE",
      isVerified: false,
    });
    await api.db.profile.update({
      where: { user_id: worker.id },
      data: { trust_level: TrustLevel.IDENTITY },
    });
  });

  it("is only for the job's poster", async () => {
    const other = await api.actor([RoleMode.CUSTOMER]);
    await api.get(`jobs/${jobId}/applications`, other).expect(404);
  });
});
