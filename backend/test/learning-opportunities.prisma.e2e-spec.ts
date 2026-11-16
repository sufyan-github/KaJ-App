import { randomUUID } from "node:crypto";
import {
  ApplicationStatus,
  AssignmentStatus,
  JobStatus,
  MentorStatus,
  RoleMode,
} from "@prisma/client";

import { ReviewsService } from "../src/modules/reviews/reviews.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.2: learning opportunities, kept apart from paid work. */
databaseDescribe("learning opportunities (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let learner: Actor;
  let categoryId: string;
  let locationId: string;
  let skillId: string;
  const slot = futureSlot(10);

  async function approvedMentor(): Promise<Actor> {
    const user = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.db.profile.update({
      where: { user_id: user.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    await api.db.user.update({
      where: { id: user.id },
      data: { role_modes: [RoleMode.CUSTOMER, RoleMode.MENTOR] },
    });
    return user;
  }

  const body = (extra: Record<string, unknown> = {}) => ({
    opportunityType: "TRAINING",
    title: "Mobile phone repair basics",
    description: "Four weeks of hands-on phone repair at my shop in Boalia.",
    categoryId,
    skillIds: [skillId],
    locationId,
    participantTerms: "FREE",
    seats: 3,
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    ...extra,
  });

  async function published(as: Actor, extra: Record<string, unknown> = {}) {
    const created = await api
      .post("learning-opportunities", as, body(extra))
      .expect(201);
    await api
      .post(`learning-opportunities/${created.body.data.id}/publish`, as)
      .expect(201);
    return created.body.data.id as string;
  }

  beforeAll(async () => {
    api = await HttpHarness.start();
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    skillId = (
      await api.db.skill.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    mentor = await approvedMentor();
    learner = await api.actor([RoleMode.WORKER]);
  });

  afterAll(async () => {
    await api?.db.featureFlag.updateMany({
      where: { key: "subscriptions_enabled" },
      data: { is_enabled: false },
    });
    await api?.close();
  });

  it("lets only an approved mentor create and publish", async () => {
    // A MENTOR role in the token is not enough without approval.
    const unapproved = await api.actor([RoleMode.MENTOR]);
    const refused = await api
      .post("learning-opportunities", unapproved, body())
      .expect(403);
    expect(refused.body.error.code).toBe("MENTOR_APPROVAL_REQUIRED");
    // No MENTOR role at all.
    await api.post("learning-opportunities", learner, body()).expect(403);

    // Suspended after drafting: can't publish.
    const draft = await api
      .post("learning-opportunities", mentor, body())
      .expect(201);
    expect(draft.body.data).toMatchObject({ status: "DRAFT" });
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.SUSPENDED },
    });
    const suspended = await api
      .post(`learning-opportunities/${draft.body.data.id}/publish`, mentor)
      .expect(403);
    expect(suspended.body.error.code).toBe("MENTOR_SUSPENDED");
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED },
    });
    // Another mentor can't publish it.
    const other = await approvedMentor();
    await api
      .post(`learning-opportunities/${draft.body.data.id}/publish`, other)
      .expect(404);
    await api
      .post(`learning-opportunities/${draft.body.data.id}/publish`, mentor)
      .expect(201);
  });

  it("states the terms, and refuses inconsistent ones", async () => {
    const paid = await api
      .post(
        "learning-opportunities",
        mentor,
        body({
          participantTerms: "PAID_BY_PARTICIPANT",
          participantFeePoisha: "150000",
        }),
      )
      .expect(201);
    expect(paid.body.data.termsText).toEqual({
      en: "Fee: ৳1500",
      bn: "ফি: ৳১৫০০",
    });
    const stipend = await api
      .post(
        "learning-opportunities",
        mentor,
        body({
          opportunityType: "APPRENTICESHIP",
          participantTerms: "STIPEND",
          stipendPoisha: "300050",
        }),
      )
      .expect(201);
    expect(stipend.body.data).toMatchObject({
      typeLabel: { en: "Apprenticeship", bn: "শিক্ষানবিশি" },
      stipendPoisha: "300050",
      termsText: { en: "Stipend: ৳3000.50", bn: "ভাতা: ৳৩০০০.৫০" },
    });
    for (const bad of [
      { participantTerms: "PAID_BY_PARTICIPANT" },
      { participantTerms: "FREE", participantFeePoisha: "1000" },
      { participantTerms: "STIPEND" },
      { participantTerms: "UNPAID", stipendPoisha: "500" },
    ]) {
      const response = await api
        .post("learning-opportunities", mentor, body(bad))
        .expect(400);
      expect(response.body.error.code).toBe("LEARNING_TERMS_INVALID");
    }
    await api
      .post("learning-opportunities", mentor, body({ opportunityType: "WORK" }))
      .expect(400);
  });

  it("never shows a learning opportunity in the worker feed or the poster's jobs", async () => {
    const id = await published(mentor);
    const learn = await api
      .get(`learning-opportunities?skillId=${skillId}&limit=100`, learner)
      .expect(200);
    expect(
      learn.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(id);
    // Walk the whole work feed.
    let cursor: string | null = null;
    const seen: string[] = [];
    do {
      const page: {
        body: {
          data: { items: Array<{ id: string }>; nextCursor: string | null };
        };
      } = await api
        .get(`jobs?limit=100${cursor ? `&cursor=${cursor}` : ""}`, learner)
        .expect(200);
      seen.push(...page.body.data.items.map((item: { id: string }) => item.id));
      cursor = page.body.data.nextCursor;
    } while (cursor);
    expect(seen).not.toContain(id);
    const mine = await api.get("jobs/mine", mentor).expect(200);
    expect(
      mine.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(id);
  });

  it("is free to apply even with the Work subscription gate on", async () => {
    const id = await published(mentor);
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
      const applied = await api
        .post(`learning-opportunities/${id}/applications`, learner, {
          message: "I want to learn phone repair.",
        })
        .expect(201);
      expect(applied.body.data.status).toBe("PENDING");
      const again = await api
        .post(`learning-opportunities/${id}/applications`, learner, {})
        .expect(409);
      expect(again.body.error.code).toBe("ALREADY_APPLIED");
    } finally {
      await api.db.featureFlag.update({
        where: { key: "subscriptions_enabled" },
        data: { is_enabled: false },
      });
    }
    // The work apply route refuses a learning opportunity.
    const work = await api
      .post(`jobs/${id}/applications`, learner, {
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(409);
    expect(work.body.error.code).toBe("NOT_A_WORK_JOB");
    const detail = await api
      .get(`learning-opportunities/${id}`, learner)
      .expect(200);
    expect(detail.body.data.viewerApplication).toMatchObject({
      status: "PENDING",
    });
  });

  it("keeps learning out of payments and the worker's reliability stats", async () => {
    const id = await published(mentor);
    const application = await api.db.application.create({
      data: {
        job_id: id,
        worker_user_id: learner.id,
        status: ApplicationStatus.ACCEPTED,
      },
    });
    const assignment = await api.db.assignment.create({
      data: {
        job_id: id,
        application_id: application.id,
        worker_user_id: learner.id,
        status: AssignmentStatus.COMPLETED,
        agreed_price_poisha: 0n,
      },
    });
    await api.db.job.update({
      where: { id },
      data: { status: JobStatus.COMPLETED, completed_at: new Date() },
    });
    const cash = await api
      .post(`assignments/${assignment.id}/payment/cash-paid`, mentor)
      .expect(409);
    expect(cash.body.error.code).toBe("NOT_A_WORK_JOB");
    expect(
      await api.db.payment.count({ where: { assignment_id: assignment.id } }),
    ).toBe(0);
    const work = await api
      .post(`assignments/${assignment.id}/complete`, mentor)
      .expect(409);
    expect(work.body.error.code).toBe("NOT_A_WORK_JOB");

    await (
      api.app.get(ReviewsService) as unknown as {
        recomputeProfiles(client: unknown, ids: string[]): Promise<void>;
      }
    ).recomputeProfiles(api.db, [learner.id]);
    const stats = await api.db.workerProfile.findUniqueOrThrow({
      where: { user_id: learner.id },
    });
    expect(stats.completed_jobs_count).toBe(0);
  });

  it("enforces the terms rules in the database too", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const base = {
      poster_user_id: poster.id,
      title: "Constraint test",
      description: "A synthetic row for the CHECK constraint test.",
      category_id: categoryId,
      location_id: locationId,
      job_type: "ONE_TIME" as const,
      payment_model: "FIXED" as const,
    };
    await expect(
      api.db.job.create({ data: { ...base, opportunity_type: "TRAINING" } }),
    ).rejects.toThrow(/jobs_opportunity_terms_check/);
    await expect(
      api.db.job.create({ data: { ...base, participant_terms: "FREE" } }),
    ).rejects.toThrow(/jobs_opportunity_terms_check/);
    await expect(
      api.db.job.create({
        data: {
          ...base,
          opportunity_type: "TRAINING",
          participant_terms: "PAID_BY_PARTICIPANT",
        },
      }),
    ).rejects.toThrow(/jobs_participant_fee_check/);
    expect(randomUUID()).toBeTruthy();
  });
});
