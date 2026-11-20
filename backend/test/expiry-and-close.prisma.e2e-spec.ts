import { randomUUID } from "node:crypto";
import { MentorStatus, RoleMode, TrustLevel } from "@prisma/client";

import { JobsService } from "../src/modules/jobs/jobs.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / DB-1: jobs and learning opportunities that were never filled end
 * (EXPIRED) after their date; owners can close an open one; a draft no
 * longer stops someone deleting their account.
 */
databaseDescribe("expiry and closing (real HTTP)", () => {
  let api: HttpHarness;
  let categoryId: string;
  let skillId: string;
  let locationId: string;

  const workJob = async (poster: Actor, publish = true) => {
    const slot = futureSlot(11);
    const id = (
      await api
        .post("jobs", poster, {
          title: `Expiry job ${randomUUID().slice(0, 6)}`,
          description: "A job used only by the DB-1 test.",
          categoryId,
          skillIds: [skillId],
          locationId,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })
        .expect(201)
    ).body.data.id as string;
    if (publish) await api.post(`jobs/${id}/publish`, poster).expect(201);
    return id;
  };
  const learning = async (mentor: Actor) => {
    const slot = futureSlot(13);
    const id = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title: `Expiry training ${randomUUID().slice(0, 6)}`,
          description: "A training used only by the DB-1 test.",
          categoryId,
          skillIds: [],
          locationId,
          participantTerms: "FREE",
          seats: 3,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id as string;
    await api.post(`learning-opportunities/${id}/publish`, mentor).expect(201);
    return id;
  };
  const mentor = async () => {
    const actor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.db.profile.update({
      where: { user_id: actor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    return actor;
  };
  const statusOf = async (id: string) =>
    (await api.db.job.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    api = await HttpHarness.start();
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    skillId = (
      await api.db.skill.findFirstOrThrow({
        where: { category_id: categoryId, is_active: true },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("expires unfilled jobs and opportunities after their date", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    const jobId = await workJob(poster);
    const worker = await api.actor([RoleMode.WORKER]);
    const application = await api.db.application.create({
      data: { job_id: jobId, worker_user_id: worker.id },
    });
    const opportunityId = await learning(await mentor());
    const past = new Date(Date.now() - 60_000);
    await api.db.job.updateMany({
      where: { id: { in: [jobId, opportunityId] } },
      data: { expires_at: past },
    });

    await api.app.get(JobsService).expireDueJobs();

    expect(await statusOf(jobId)).toBe("EXPIRED");
    expect(await statusOf(opportunityId)).toBe("EXPIRED");
    expect(
      (
        await api.db.application.findUniqueOrThrow({
          where: { id: application.id },
        })
      ).status,
    ).toBe("EXPIRED");
  });

  it("lets the poster close an open job, and only the poster", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    const jobId = await workJob(poster);
    const stranger = await api.actor([RoleMode.CUSTOMER]);
    const refused = await api.post(`jobs/${jobId}/close`, stranger);
    expect([403, 404]).toContain(refused.status);
    const closed = await api.post(`jobs/${jobId}/close`, poster).expect(201);
    expect(closed.body.data.status).toBe("CANCELLED_BY_CUSTOMER");
    // A draft can be discarded the same way.
    const draft = await workJob(poster, false);
    await api.post(`jobs/${draft}/close`, poster).expect(201);
    expect(await statusOf(draft)).toBe("CANCELLED_BY_CUSTOMER");
  });

  it("lets a mentor close an opportunity; with learners it only stops applications", async () => {
    const owner = await mentor();
    const empty = await learning(owner);
    await api.post(`learning-opportunities/${empty}/close`, owner).expect(201);
    expect(await statusOf(empty)).toBe("CANCELLED_BY_CUSTOMER");

    const running = await learning(owner);
    const learner = await api.actor([RoleMode.WORKER]);
    const applicationId = (
      await api
        .post(`learning-opportunities/${running}/applications`, learner)
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-applications/${applicationId}/accept`, owner)
      .expect(201);
    await api
      .post(`learning-opportunities/${running}/close`, owner)
      .expect(201);
    expect(await statusOf(running)).toBe("APPLICATIONS_OPEN");
    const late = await api.actor([RoleMode.WORKER]);
    const refused = await api
      .post(`learning-opportunities/${running}/applications`, late)
      .expect(409);
    expect(refused.body.error.code).toBe("OPPORTUNITY_CLOSED");
  });

  it("does not let a draft stop an account deletion", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    await workJob(poster, false);
    await api.delete("me", poster).expect(200);
  });
});
