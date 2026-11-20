import { AssignmentStatus, RoleMode, TrustLevel } from "@prisma/client";

import { futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W12: the fee the cancellation preview shows is recorded on the
 * assignment when the cancellation goes through, and both sides see it.
 */
databaseDescribe("cancellation fee is recorded (real HTTP)", () => {
  let api: HttpHarness;

  beforeAll(async () => {
    api = await HttpHarness.start();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("records a late customer cancellation's fee and shows it", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    const worker = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
    });
    const [category, location] = await Promise.all([
      api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      }),
      api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      }),
    ]);
    // A confirmed assignment, then moved to start within the hour (the
    // policy's last tier: half the price).
    const slot = futureSlot(9);
    const job = await api.db.job.create({
      data: {
        poster_user_id: poster.id,
        title: "Late cancellation job",
        description: "A job used only by the W12 test.",
        category_id: category.id,
        location_id: location.id,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
        budget_min_poisha: 20000n,
        budget_max_poisha: 20000n,
        status: "CONFIRMED",
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
      },
    });
    const application = await api.db.application.create({
      data: { job_id: job.id, worker_user_id: worker.id, status: "ACCEPTED" },
    });
    const soon = new Date(Date.now() + 60 * 60_000);
    const assignment = await api.db.assignment.create({
      data: {
        job_id: job.id,
        application_id: application.id,
        worker_user_id: worker.id,
        status: AssignmentStatus.CONFIRMED,
        agreed_price_poisha: 20000n,
        agreed_starts_at: soon,
        agreed_ends_at: new Date(soon.getTime() + 3_600_000),
        confirmed_at: new Date(),
      },
    });

    const cancelled = await api
      .post(`assignments/${assignment.id}/cancel`, poster, {
        reasonCode: "CHANGE_OF_PLANS",
        confirmed: true,
      })
      .expect(201);
    const fee = cancelled.body.data.preview.feePoisha;
    expect(BigInt(fee)).toBeGreaterThan(0n);

    const row = await api.db.assignment.findUniqueOrThrow({
      where: { id: assignment.id },
    });
    expect(row.cancellation_fee_poisha?.toString()).toBe(fee);
    for (const as of [poster, worker]) {
      const seen = await api
        .get(`assignments/${assignment.id}`, as)
        .expect(200);
      expect(seen.body.data.cancellationFeePoisha).toBe(fee);
    }
  });
});
