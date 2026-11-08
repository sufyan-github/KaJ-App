import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RoleMode, TrustLevel } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.bootstrap";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AuthTokenService } from "../src/modules/auth/auth-token.service";
import { ReviewsService } from "../src/modules/reviews/reviews.service";

const DISPUTE_REASON = "NO_SHOW";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * Concurrent requests against the real API and PostgreSQL. Before the
 * optimistic transition check, every one of these succeeded.
 */
databaseDescribe("job lifecycle under concurrent requests", () => {
  let app: INestApplication;
  let db: PrismaService;
  let poster: { id: string; token: string };
  let worker: { id: string; token: string };
  let categoryId: string;
  let locationId: string;
  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCHours(4, 0, 0, 0); // 10:00 Dhaka
  const end = new Date(start.getTime() + 3_600_000);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    db = app.get(PrismaService);
    categoryId = (await db.category.findFirstOrThrow()).id;
    locationId = (await db.location.findFirstOrThrow()).id;
    async function actor(role: RoleMode) {
      const user = await db.user.create({
        data: {
          phone_e164: `+88018${Math.floor(10_000_000 + Math.random() * 80_000_000)}`,
          role_modes: [role],
          active_role: role,
          profile: {
            create: {
              display_name: "Concurrency synthetic actor",
              trust_level: TrustLevel.IDENTITY,
            },
          },
        },
      });
      const token = await app.get(AuthTokenService).createAccessToken(
        {
          id: user.id,
          phoneE164: user.phone_e164!,
          status: user.status,
          roles: [role],
          activeRole: role,
          isAdmin: false,
        },
        randomUUID(),
      );
      return { id: user.id, token };
    }
    poster = await actor(RoleMode.CUSTOMER);
    worker = await actor(RoleMode.WORKER);
    await db.availabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, day) => ({
        user_id: worker.id,
        day_of_week: day,
        start_time: new Date("1970-01-01T08:00:00Z"),
        end_time: new Date("1970-01-01T22:00:00Z"),
      })),
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (path: string, token: string, body = {}) =>
    request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .auth(token, { type: "bearer" })
      .send(body);

  async function draft() {
    const result = await post("jobs", poster.token, {
      title: "Concurrency test job",
      description: "A synthetic job used only by the concurrency test.",
      categoryId,
      locationId,
      skillIds: [],
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      budgetMinPoisha: "10000",
      budgetMaxPoisha: "20000",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }).expect(201);
    return result.body.data.id as string;
  }

  async function confirmedAssignment() {
    const id = await draft();
    await post(`jobs/${id}/publish`, poster.token).expect(201);
    const application = await post(`jobs/${id}/applications`, worker.token, {
      message: "I can do this job on time.",
      proposedPricePoisha: "15000",
      proposedStartsAt: start.toISOString(),
      proposedEndsAt: end.toISOString(),
    }).expect(201);
    const accepted = await post(
      `applications/${application.body.data.id}/accept`,
      poster.token,
    ).expect(201);
    const assignmentId = accepted.body.data.id as string;
    await post(`assignments/${assignmentId}/confirm`, worker.token).expect(201);
    return { jobId: id, assignmentId };
  }

  it("publishes a draft exactly once when five publishes race", async () => {
    const id = await draft();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(`jobs/${id}/publish`, poster.token)),
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(4);
    expect(
      await db.jobStatusHistory.count({
        where: { job_id: id, to_status: "PUBLISHED" },
      }),
    ).toBe(1);
  });

  it("accepts an application once when two accepts race, without a 500", async () => {
    const id = await draft();
    await post(`jobs/${id}/publish`, poster.token).expect(201);
    const application = await post(`jobs/${id}/applications`, worker.token, {
      message: "I can do this job on time.",
      proposedPricePoisha: "15000",
      proposedStartsAt: start.toISOString(),
      proposedEndsAt: end.toISOString(),
    }).expect(201);
    const responses = await Promise.all([
      post(`applications/${application.body.data.id}/accept`, poster.token),
      post(`applications/${application.body.data.id}/accept`, poster.token),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await db.assignment.count({ where: { job_id: id } })).toBe(1);
  });

  it("lets only one side win when customer and worker cancel at once", async () => {
    const { jobId, assignmentId } = await confirmedAssignment();
    const responses = await Promise.all([
      post(`assignments/${assignmentId}/cancel`, poster.token, {
        reasonCode: "CHANGE_OF_PLAN",
        confirmed: true,
      }),
      post(`assignments/${assignmentId}/cancel`, worker.token, {
        reasonCode: "CHANGE_OF_PLAN",
        confirmed: true,
      }),
    ]);
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses.filter((status) => status < 300)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
    const cancellations = await db.jobStatusHistory.count({
      where: {
        job_id: jobId,
        to_status: { in: ["CANCELLED_BY_CUSTOMER", "CANCELLED_BY_WORKER"] },
      },
    });
    expect(cancellations).toBe(1);
  });

  describe("guarded lifecycle exits", () => {
    async function pendingAssignment() {
      const id = await draft();
      await post(`jobs/${id}/publish`, poster.token).expect(201);
      const application = await post(`jobs/${id}/applications`, worker.token, {
        message: "I can do this job on time.",
        proposedPricePoisha: "15000",
        proposedStartsAt: start.toISOString(),
        proposedEndsAt: end.toISOString(),
      }).expect(201);
      const accepted = await post(
        `applications/${application.body.data.id}/accept`,
        poster.token,
      ).expect(201);
      return { jobId: id, assignmentId: accepted.body.data.id as string };
    }

    /** Moves a confirmed assignment's agreed start into the past and the job to IN_PROGRESS, as the clock runner would. */
    async function startedWithoutCheckIn(minutesAgo: number) {
      const { jobId, assignmentId } = await confirmedAssignment();
      const startsAt = new Date(Date.now() - minutesAgo * 60_000);
      await db.assignment.update({
        where: { id: assignmentId },
        data: {
          agreed_starts_at: startsAt,
          agreed_ends_at: new Date(startsAt.getTime() + 3_600_000),
        },
      });
      await db.job.update({
        where: { id: jobId },
        data: { status: "IN_PROGRESS" },
      });
      return { jobId, assignmentId };
    }

    it("does not let a declined worker cancel the job", async () => {
      const { jobId, assignmentId } = await pendingAssignment();
      await post(`assignments/${assignmentId}/decline`, worker.token).expect(
        201,
      );
      const response = await post(
        `assignments/${assignmentId}/cancel`,
        worker.token,
        { reasonCode: "CHANGE_OF_PLAN", confirmed: true },
      ).expect(409);
      expect(response.body.error.message).toContain("no longer be cancelled");
      expect(
        (await db.job.findUniqueOrThrow({ where: { id: jobId } })).status,
      ).not.toMatch(/^CANCELLED/);
    });

    it("lets the customer report a no-show after the grace period", async () => {
      const { jobId, assignmentId } = await startedWithoutCheckIn(45);
      await post(`assignments/${assignmentId}/cancel`, poster.token, {
        reasonCode: "WORKER_NO_SHOW",
        confirmed: true,
      }).expect(201);
      expect(
        (await db.job.findUniqueOrThrow({ where: { id: jobId } })).status,
      ).toBe("CANCELLED_BY_CUSTOMER");
      // Queued for an administrator; no customer strike is recorded.
      expect(
        await db.report.count({
          where: {
            target_id: assignmentId,
            reason_code: "WORKER_NO_SHOW",
          },
        }),
      ).toBe(1);
      expect(
        await db.auditLog.count({
          where: {
            entity_id: assignmentId,
            action: "CANCELLATION_STRIKE",
          },
        }),
      ).toBe(0);
    });

    it("refuses a no-show report before the grace period or from the worker", async () => {
      const { assignmentId } = await startedWithoutCheckIn(10);
      await post(`assignments/${assignmentId}/cancel`, poster.token, {
        reasonCode: "WORKER_NO_SHOW",
        confirmed: true,
      }).expect(409);
      await post(`assignments/${assignmentId}/cancel`, worker.token, {
        reasonCode: "WORKER_NO_SHOW",
        confirmed: true,
      }).expect(409);
    });

    it("lets a party open a dispute on an in-progress job", async () => {
      const { jobId, assignmentId } = await startedWithoutCheckIn(45);
      await post(`assignments/${assignmentId}/disputes`, poster.token, {
        reasonCode: DISPUTE_REASON,
        description: "The worker never arrived and the job is stuck.",
      }).expect(201);
      expect(
        (await db.job.findUniqueOrThrow({ where: { id: jobId } })).status,
      ).toBe("DISPUTED");
    });

    it("refuses multi-worker jobs with a clear error", async () => {
      const response = await post("jobs", poster.token, {
        title: "Two-person cleaning job",
        description: "A synthetic job used only by the concurrency test.",
        categoryId,
        locationId,
        skillIds: [],
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        workersRequired: 2,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      }).expect(422);
      expect(response.body.error.code).toBe("MULTI_WORKER_NOT_SUPPORTED");
    });
  });

  it("counts only worker-caused cancellations in the worker's cancellation rate", async () => {
    await db.workerProfile.upsert({
      where: { user_id: worker.id },
      create: { user_id: worker.id },
      update: {},
    });
    const reviews = app.get(ReviewsService) as unknown as {
      recomputeProfiles(
        client: PrismaService,
        userIds: string[],
      ): Promise<void>;
    };
    const rate = async () => {
      await reviews.recomputeProfiles(db, [worker.id]);
      return (
        await db.workerProfile.findUniqueOrThrow({
          where: { user_id: worker.id },
        })
      ).cancellation_rate_bps;
    };
    const before = await rate();

    const byCustomer = await confirmedAssignment();
    await post(`assignments/${byCustomer.assignmentId}/cancel`, poster.token, {
      reasonCode: "CHANGE_OF_PLAN",
      confirmed: true,
    }).expect(201);
    expect(await rate()).toBe(before);

    const byWorker = await confirmedAssignment();
    await post(`assignments/${byWorker.assignmentId}/cancel`, worker.token, {
      reasonCode: "CHANGE_OF_PLAN",
      confirmed: true,
    }).expect(201);
    expect(await rate()).toBeGreaterThan(before);
  });
});
