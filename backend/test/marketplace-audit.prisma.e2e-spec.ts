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
databaseDescribe("marketplace audit: real HTTP and database journeys", () => {
  let app: INestApplication;
  let db: PrismaService;
  let poster: { id: string; token: string };
  let worker: { id: string; token: string };
  let stranger: { id: string; token: string };
  let categoryId: string;
  let locationId: string;
  const start = new Date(Date.now() + 3 * 86400000);
  start.setUTCHours(4, 0, 0, 0); // 10:00 Dhaka
  const end = new Date(start.getTime() + 3600000);
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
          phone_e164: `+88018${Math.floor(10000000 + Math.random() * 80000000)}`,
          role_modes: [role],
          active_role: role,
          profile: {
            create: {
              display_name: "Audit synthetic actor",
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
    stranger = await actor(RoleMode.CUSTOMER);
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
  }); // Entire disposable audit DB is removed after the run.
  async function createJob() {
    const result = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .auth(poster.token, { type: "bearer" })
      .send({
        title: "Audit tuition job",
        description:
          "বাংলা ও গণিত পড়ানোর পরীক্ষামূলক কাজ — isolated audit only.",
        categoryId,
        locationId,
        skillIds: [],
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "10000",
        budgetMaxPoisha: "20000",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
      })
      .expect(201);
    return result.body.data.id as string;
  }
  const post = (path: string, token: string, body = {}) =>
    request(app.getHttpServer())
      .post(`/api/v1/${path}`)
      .auth(token, { type: "bearer" })
      .send(body);
  const apply = (id: string) =>
    post(`jobs/${id}/applications`, worker.token, {
      message: "আমি সময়মতো কাজটি করতে পারব।",
      proposedPricePoisha: "15000",
      proposedStartsAt: start.toISOString(),
      proposedEndsAt: end.toISOString(),
    });

  it("preserves create → publish → apply → accept → confirm → submit → complete with notifications", async () => {
    const id = await createJob();
    await post(`jobs/${id}/publish`, stranger.token).expect(404);
    await post(`jobs/${id}/publish`, poster.token).expect(201);
    const application = await apply(id).expect(201);
    const accepted = await post(
      `applications/${application.body.data.id}/accept`,
      poster.token,
    ).expect(201);
    const assignmentId = accepted.body.data.id;
    await post(`assignments/${assignmentId}/confirm`, worker.token).expect(201);
    await post(`assignments/${assignmentId}/submit`, worker.token).expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/assignments/${assignmentId}`)
      .auth(stranger.token, { type: "bearer" })
      .expect(404);
    // Simulate elapsed work time only in the disposable fixture.
    await db.assignment.update({
      where: { id: assignmentId },
      data: {
        agreed_starts_at: new Date(Date.now() - 7200000),
        agreed_ends_at: new Date(Date.now() - 3600000),
      },
    });
    await post(`assignments/${assignmentId}/submit`, worker.token).expect(201);
    await post(`assignments/${assignmentId}/complete`, poster.token).expect(
      201,
    );
    expect((await db.job.findUniqueOrThrow({ where: { id } })).status).toBe(
      "COMPLETED",
    );
    expect(
      await db.notification.count({
        where: { user_id: { in: [poster.id, worker.id] } },
      }),
    ).toBeGreaterThan(0);
    expect(
      await db.contract.count({ where: { assignment_id: assignmentId } }),
    ).toBeGreaterThan(0);
  });

  it("duplicate application returns a conflict and preserves the application count", async () => {
    const id = await createJob();
    await post(`jobs/${id}/publish`, poster.token).expect(201);
    await apply(id).expect(201);
    await apply(id).expect(409);
    expect(
      (await db.job.findUniqueOrThrow({ where: { id } })).applications_count,
    ).toBe(1);
  });
});
