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

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

type Actor = { id: string; token: string };

databaseDescribe("hiring eligibility and job privacy (real HTTP)", () => {
  let app: INestApplication;
  let db: PrismaService;
  let poster: Actor;
  let worker: Actor;
  let stranger: Actor;
  let categoryId: string;
  let locationId: string;
  const createdCategoryIds: string[] = [];
  const start = new Date(Date.now() + 3 * 86_400_000);
  start.setUTCHours(4, 0, 0, 0);
  const end = new Date(start.getTime() + 3_600_000);

  async function actor(
    roles: RoleMode[],
    trust: TrustLevel = TrustLevel.IDENTITY,
    birthYear: number | null = null,
  ): Promise<Actor> {
    const user = await db.user.create({
      data: {
        phone_e164: `+88018${Math.floor(10_000_000 + Math.random() * 80_000_000)}`,
        role_modes: roles,
        active_role: roles[0],
        profile: {
          create: {
            display_name: "Policy synthetic actor",
            trust_level: trust,
            birth_year: birthYear,
          },
        },
      },
    });
    const token = await app.get(AuthTokenService).createAccessToken(
      {
        id: user.id,
        phoneE164: user.phone_e164!,
        status: user.status,
        roles,
        activeRole: roles[0]!,
        isAdmin: false,
      },
      randomUUID(),
    );
    if (roles.includes(RoleMode.WORKER))
      await db.availabilityRule.createMany({
        data: Array.from({ length: 7 }, (_, day) => ({
          user_id: user.id,
          day_of_week: day,
          start_time: new Date("1970-01-01T08:00:00Z"),
          end_time: new Date("1970-01-01T22:00:00Z"),
        })),
      });
    return { id: user.id, token };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    db = app.get(PrismaService);
    categoryId = (
      await db.category.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    locationId = (
      await db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    poster = await actor([RoleMode.CUSTOMER]);
    worker = await actor([RoleMode.WORKER]);
    stranger = await actor([RoleMode.CUSTOMER]);
  });

  afterAll(async () => {
    await db?.job.deleteMany({
      where: { category_id: { in: createdCategoryIds } },
    });
    await db?.category.deleteMany({
      where: { id: { in: createdCategoryIds } },
    });
    await app?.close();
  });

  const call = (method: "get" | "post", path: string, as: Actor, body = {}) =>
    method === "get"
      ? request(app.getHttpServer())
          .get(`/api/v1/${path}`)
          .auth(as.token, { type: "bearer" })
      : request(app.getHttpServer())
          .post(`/api/v1/${path}`)
          .auth(as.token, { type: "bearer" })
          .send(body);

  async function policyCategory(policy: Record<string, unknown>) {
    const category = await db.category.create({
      data: {
        slug: `policy-test-${randomUUID()}`,
        name_en: "Policy test",
        name_bn: "নীতি পরীক্ষা",
        ...policy,
      },
    });
    createdCategoryIds.push(category.id);
    return category.id;
  }

  function booking(categoryOverride = categoryId, startsAt = start) {
    return {
      title: "Booking policy test",
      description: "A synthetic booking request for the policy test.",
      categoryId: categoryOverride,
      locationId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
      offeredPricePoisha: "15000",
    };
  }

  async function openJob(as: Actor = poster, category = categoryId) {
    const created = await call("post", "jobs", as, {
      title: "Privacy test job",
      description: "A synthetic job used only by the privacy test.",
      categoryId: category,
      locationId,
      skillIds: [],
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      budgetMinPoisha: "10000",
      budgetMaxPoisha: "20000",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }).expect(201);
    return created.body.data.id as string;
  }

  describe("booking guards", () => {
    it("refuses to book an account that is not a worker", async () => {
      const response = await call(
        "post",
        `workers/${stranger.id}/booking-requests`,
        poster,
        booking(),
      ).expect(422);
      expect(response.body.error.code).toBe("WORKER_ROLE_REQUIRED");
    });

    it("refuses to book a worker without identity verification", async () => {
      const unverified = await actor([RoleMode.WORKER], TrustLevel.PHONE);
      await call(
        "post",
        `workers/${unverified.id}/booking-requests`,
        poster,
        booking(),
      ).expect(403);
    });

    it("refuses to book a worker who blocked the poster, without saying so", async () => {
      const blocking = await actor([RoleMode.WORKER]);
      await db.userBlock.create({
        data: { blocker_user_id: blocking.id, blocked_user_id: poster.id },
      });
      const response = await call(
        "post",
        `workers/${blocking.id}/booking-requests`,
        poster,
        booking(),
      ).expect(422);
      expect(response.body.error.code).toBe("HIRING_UNAVAILABLE");
      expect(JSON.stringify(response.body)).not.toMatch(/block/i);
    });

    it("returns 404 for an unknown worker instead of 500", async () => {
      await call(
        "post",
        `workers/${randomUUID()}/booking-requests`,
        poster,
        booking(),
      ).expect(404);
    });

    it("refuses a slot in the past", async () => {
      const response = await call(
        "post",
        `workers/${worker.id}/booking-requests`,
        poster,
        booking(categoryId, new Date(Date.now() - 86_400_000)),
      ).expect(422);
      expect(response.body.error.code).toBe("SLOT_IN_PAST");
    });

    it("refuses an unknown category instead of failing with 500", async () => {
      const response = await call(
        "post",
        `workers/${worker.id}/booking-requests`,
        poster,
        booking(randomUUID()),
      ).expect(422);
      expect(response.body.error.code).toBe("INVALID_REFERENCE");
    });
  });

  describe("category safety policy", () => {
    it("asks for a birth year when the category minimum age is above 18", async () => {
      const childcare = await policyCategory({ min_age: 21 });
      const response = await call(
        "post",
        `workers/${worker.id}/booking-requests`,
        poster,
        booking(childcare),
      ).expect(422);
      expect(response.body.error).toMatchObject({
        code: "CATEGORY_POLICY_UNMET",
        details: [{ type: "BIRTH_YEAR", minAge: 21 }],
      });
    });

    it("refuses a worker below the category minimum age", async () => {
      const young = await actor(
        [RoleMode.WORKER],
        TrustLevel.IDENTITY,
        new Date().getUTCFullYear() - 17,
      );
      const response = await call(
        "post",
        `workers/${young.id}/booking-requests`,
        poster,
        booking(),
      ).expect(422);
      expect(response.body.error.details).toEqual([
        { type: "MIN_AGE", minAge: 18 },
      ]);
    });

    it("requires a licence where the category says so", async () => {
      const electrical = await policyCategory({ requires_licence: true });
      const response = await call(
        "post",
        `workers/${worker.id}/booking-requests`,
        poster,
        booking(electrical),
      ).expect(422);
      expect(response.body.error.details).toEqual([{ type: "LICENCE" }]);
    });

    it("requires an identity-verified poster where the category says so", async () => {
      const sensitive = await policyCategory({
        requires_poster_identity: true,
      });
      const phoneOnlyPoster = await actor(
        [RoleMode.CUSTOMER],
        TrustLevel.PHONE,
      );
      const id = await openJobDraft(phoneOnlyPoster, sensitive);
      const response = await call(
        "post",
        `jobs/${id}/publish`,
        phoneOnlyPoster,
      ).expect(422);
      expect(response.body.error.details).toEqual([
        { type: "POSTER_IDENTITY" },
      ]);
    });
  });

  async function openJobDraft(as: Actor, category: string) {
    const created = await call("post", "jobs", as, {
      title: "Policy test job",
      description: "A synthetic job used only by the policy test.",
      categoryId: category,
      locationId,
      skillIds: [],
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    }).expect(201);
    return created.body.data.id as string;
  }

  describe("job privacy", () => {
    it("hides other people's drafts and private fields", async () => {
      const draftId = await openJob();
      await call("get", `jobs/${draftId}`, stranger).expect(404);
      const own = await call("get", `jobs/${draftId}`, poster).expect(200);
      expect(own.body.data).toHaveProperty("exact_address_encrypted");

      await call("post", `jobs/${draftId}/publish`, poster).expect(201);
      const open = await call("get", `jobs/${draftId}`, stranger).expect(200);
      for (const field of ["exact_address_encrypted", "lat", "lng"])
        expect(open.body.data).not.toHaveProperty(field);
      expect(open.body.data).toMatchObject({
        id: draftId,
        title: expect.any(String),
      });
    });

    it("hides another user's occurrence schedule", async () => {
      const id = await openJob();
      await call("get", `jobs/${id}/occurrences`, stranger).expect(404);
      await call("get", `jobs/${id}/occurrences`, poster).expect(200);
    });

    it("keeps expired and own jobs out of the worker feed", async () => {
      const expiredId = await openJob();
      await call("post", `jobs/${expiredId}/publish`, poster).expect(201);
      await db.job.update({
        where: { id: expiredId },
        data: { expires_at: new Date(Date.now() - 60_000) },
      });
      const feed = await call("get", "jobs", worker).expect(200);
      const ids = (feed.body.data.items as Array<{ id: string }>).map(
        (item) => item.id,
      );
      expect(ids).not.toContain(expiredId);
      const posterFeed = await call("get", "jobs", poster).expect(200);
      for (const item of posterFeed.body.data.items as Array<{
        poster_user_id?: string;
      }>)
        expect(item.poster_user_id).not.toBe(poster.id);
    });
  });

  it("limits dispute chat evidence to the two parties", async () => {
    const id = await openJob();
    await call("post", `jobs/${id}/publish`, poster).expect(201);
    const otherApplicant = await actor([RoleMode.WORKER]);
    const application = await call("post", `jobs/${id}/applications`, worker, {
      message: "I can do this job on time.",
      proposedPricePoisha: "15000",
      proposedStartsAt: start.toISOString(),
      proposedEndsAt: end.toISOString(),
    }).expect(201);
    const accepted = await call(
      "post",
      `applications/${application.body.data.id}/accept`,
      poster,
    ).expect(201);
    const assignmentId = accepted.body.data.id as string;
    await call("post", `assignments/${assignmentId}/confirm`, worker).expect(
      201,
    );
    for (const [other, text] of [
      [worker, "party message"],
      [otherApplicant, "private applicant message"],
    ] as const) {
      await db.conversation.create({
        data: {
          job_id: id,
          scope_key: `test:${id}:${other.id}`,
          participants: {
            create: [{ user_id: poster.id }, { user_id: other.id }],
          },
          messages: {
            create: [{ sender_user_id: other.id, type: "TEXT", body: text }],
          },
        },
      });
    }
    await db.job.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    const dispute = await call(
      "post",
      `assignments/${assignmentId}/disputes`,
      poster,
      {
        reasonCode: "NOT_COMPLETED",
        description: "The work was not finished as agreed in the chat.",
      },
    ).expect(201);
    const transcript = await db.disputeEvidence.findFirstOrThrow({
      where: {
        dispute_id: dispute.body.data.id,
        kind: "SYSTEM_CHAT_TRANSCRIPT",
      },
    });
    expect(transcript.text).toContain("party message");
    expect(transcript.text).not.toContain("private applicant message");
  });
});
