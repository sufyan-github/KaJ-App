import { randomUUID } from "node:crypto";
import { MentorStatus, RoleMode } from "@prisma/client";

import { PaymentsService } from "../src/modules/payments/payments.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W2, DB-7: a learning enrolment shares the assignments table with
 * paid work, but never shows up in, or gets paid through, the work routes.
 */
databaseDescribe("learning rows stay out of work routes (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let learner: Actor;
  let enrolmentId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    const slot = futureSlot(14);
    mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    learner = await api.actor([RoleMode.WORKER]);
    const [category, location] = await Promise.all([
      api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      }),
      api.db.location.findFirstOrThrow({ where: { is_active: true } }),
    ]);
    const opportunityId = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "APPRENTICESHIP",
          title: "Work-only paths apprenticeship",
          description: "An apprenticeship with a stipend, for the W2 test.",
          categoryId: category.id,
          skillIds: [],
          locationId: location.id,
          participantTerms: "STIPEND",
          stipendPoisha: "200000",
          seats: 1,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "HYBRID",
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-opportunities/${opportunityId}/publish`, mentor)
      .expect(201);
    const applicationId = (
      await api
        .post(`learning-opportunities/${opportunityId}/applications`, learner)
        .expect(201)
    ).body.data.id;
    enrolmentId = (
      await api
        .post(`learning-applications/${applicationId}/accept`, mentor)
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("keeps the enrolment out of the work assignment list and detail", async () => {
    for (const as of [mentor, learner]) {
      const list = await api.get("assignments", as).expect(200);
      expect(
        list.body.data.items.map((item: { id: string }) => item.id),
      ).not.toContain(enrolmentId);
      await api.get(`assignments/${enrolmentId}`, as).expect(404);
    }
    // The learning route still shows it.
    await api.get(`learning-enrolments/${enrolmentId}`, learner).expect(200);
  });

  it("refuses a payment intent on a learning row", async () => {
    const refused = await api
      .post(`assignments/${enrolmentId}/payment-intent`, mentor)
      .set("Idempotency-Key", randomUUID())
      .expect(409);
    expect(refused.body.error.code).toBe("NOT_A_WORK_JOB");
    expect(
      await api.db.payment.count({ where: { assignment_id: enrolmentId } }),
    ).toBe(0);
  });

  it("leaves learning payments out of the admin work-payment totals", async () => {
    const job = await api.db.assignment.findUniqueOrThrow({
      where: { id: enrolmentId },
      select: { job_id: true },
    });
    // A row like the ones created before this fix.
    await api.db.payment.create({
      data: {
        job_id: job.job_id,
        assignment_id: enrolmentId,
        payer_user_id: mentor.id,
        agreed_amount_poisha: 200000n,
        amount_poisha: 200000n,
        worker_earning_poisha: 200000n,
        fee_rule_key: "test",
        fee_payer: "worker",
        idempotency_key: randomUUID(),
      },
    });
    const overview = await api.app.get(PaymentsService).adminOverview();
    expect(JSON.stringify(overview.items)).not.toContain(enrolmentId);
    const history = await api.get("payments/history", mentor).expect(200);
    expect(JSON.stringify(history.body.data)).not.toContain(enrolmentId);
  });
});
