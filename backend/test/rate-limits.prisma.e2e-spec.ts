import { randomUUID } from "node:crypto";
import { RoleMode } from "@prisma/client";
import { Response } from "supertest";

import { USER_RATE_LIMITS } from "../src/common/rate-limit/user-rate-limit";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R1 / API-3: per-person limits on chat, reports, uploads, bookings,
 * consultation holds and invitations. Each case makes one call more than the
 * limit (every call counts, whatever its outcome) and expects the last to be
 * 429 RATE_LIMITED with Retry-After.
 */
databaseDescribe("per-person rate limits (real HTTP)", () => {
  let api: HttpHarness;

  const overLimit = async (
    limit: number,
    call: (index: number) => Promise<Response>,
  ) => {
    const answers: Response[] = [];
    for (let index = 0; index <= limit; index += 1)
      answers.push(await call(index));
    const last = answers[answers.length - 1]!;
    expect(answers.slice(0, -1).map((answer) => answer.status)).not.toContain(
      429,
    );
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe("RATE_LIMITED");
    expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("limits chat messages per sender", async () => {
    const sender = await api.actor([RoleMode.CUSTOMER]);
    const other = await api.actor([RoleMode.WORKER]);
    const conversation = await api.db.conversation.create({
      data: {
        scope_key: `rate-limit:${randomUUID()}`,
        participants: {
          create: [{ user_id: sender.id }, { user_id: other.id }],
        },
      },
    });
    await overLimit(USER_RATE_LIMITS["chat-send"].limit, (index) =>
      api.post(`conversations/${conversation.id}/messages`, sender, {
        type: "TEXT",
        body: `Message ${index}`,
        clientNonce: randomUUID(),
      }),
    );
    // Someone else in the same conversation is not affected.
    await api
      .post(`conversations/${conversation.id}/messages`, other, {
        type: "TEXT",
        body: "Still fine",
        clientNonce: randomUUID(),
      })
      .expect(201);
  });

  it("limits safety reports per reporter", async () => {
    const reporter = await api.actor([RoleMode.CUSTOMER]);
    await overLimit(USER_RATE_LIMITS["report-create"].limit, async () => {
      const target = await api.actor([RoleMode.WORKER]);
      return api.post("reports", reporter, {
        targetType: "USER",
        targetId: target.id,
        reasonCode: "HARASSMENT",
        description: "Rate limit test report.",
      });
    });
  });

  it("limits upload URLs per person", async () => {
    const user = await api.actor([RoleMode.WORKER]);
    await overLimit(USER_RATE_LIMITS["upload-sign"].limit, () =>
      api.post("uploads/sign", user, {
        kind: "PORTFOLIO_IMAGE",
        mime: "application/pdf",
        sizeBytes: 100,
      }),
    );
  });

  it("limits direct booking requests", async () => {
    const customer = await api.actor([RoleMode.CUSTOMER]);
    await overLimit(USER_RATE_LIMITS["booking-request"].limit, () =>
      api.post(`workers/${randomUUID()}/booking-requests`, customer, {}),
    );
  });

  it("limits consultation bookings", async () => {
    const learner = await api.actor([RoleMode.CUSTOMER]);
    await overLimit(USER_RATE_LIMITS["consultation-hold"].limit, () =>
      api.post("sessions/consultations", learner, {
        expertUserId: randomUUID(),
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        durationMinutes: 30,
        mode: "IN_APP_CHAT",
      }),
    );
  });

  it("limits invitations, across groups and businesses", async () => {
    const host = await api.actor([RoleMode.BUSINESS, RoleMode.WORKER]);
    const area = await api.db.location.findFirstOrThrow({
      where: { type: "AREA", is_active: true },
    });
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    const businessId = (
      await api
        .post("businesses", host, {
          name: "Rate limit kitchen",
          categoryId: sector.id,
          locationId: area.id,
        })
        .expect(201)
    ).body.data.id;
    const groupId = (
      await api
        .post("community/groups", host, {
          name: "Rate limit group",
          description: "A group used only by the rate-limit test.",
          locationId: area.id,
        })
        .expect(201)
    ).body.data.id;
    // Calls the policy refuses (someone else's resource) are not counted,
    // so these go to the host's own business and group.
    const routes = [
      `businesses/${businessId}/members`,
      `community/groups/${groupId}/members`,
    ];
    await overLimit(USER_RATE_LIMITS.invite.limit, (index) =>
      api.post(routes[index % routes.length]!, host, {
        userIds: [randomUUID()],
      }),
    );
  });
});
