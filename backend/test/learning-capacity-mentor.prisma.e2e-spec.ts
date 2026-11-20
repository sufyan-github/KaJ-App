import { randomUUID } from "node:crypto";
import { AdminRole, MentorStatus, RoleMode } from "@prisma/client";

import { LearningAdminService } from "../src/modules/learning/learning-admin.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W7: a full learning opportunity stops taking applications and leaves
 * the feed; a suspended mentor's opportunities leave the feed, refuse new
 * applications, and the mentor is told.
 */
databaseDescribe("learning capacity and mentor suspension (real HTTP)", () => {
  let api: HttpHarness;
  let category: string;
  let location: string;

  const makeMentor = async () => {
    const mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    return mentor;
  };
  const publish = async (mentor: Actor, seats: number) => {
    const slot = futureSlot(20);
    const id = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title: `Capacity training ${randomUUID().slice(0, 6)}`,
          description: "A training used only by the W7 test.",
          categoryId: category,
          skillIds: [],
          locationId: location,
          participantTerms: "FREE",
          seats,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id as string;
    await api.post(`learning-opportunities/${id}/publish`, mentor).expect(201);
    return id;
  };
  const inFeed = async (as: Actor, id: string) =>
    (
      await api.get("learning-opportunities?limit=100", as).expect(200)
    ).body.data.items.some((item: { id: string }) => item.id === id);

  beforeAll(async () => {
    api = await HttpHarness.start();
    category = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    location = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("closes a full opportunity to new applications and hides it from the feed", async () => {
    const mentor = await makeMentor();
    const id = await publish(mentor, 1);
    const first = await api.actor([RoleMode.WORKER]);
    const later = await api.actor([RoleMode.WORKER]);
    const applicationId = (
      await api
        .post(`learning-opportunities/${id}/applications`, first)
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-applications/${applicationId}/accept`, mentor)
      .expect(201);

    expect(await inFeed(later, id)).toBe(false);
    const refused = await api
      .post(`learning-opportunities/${id}/applications`, later)
      .expect(409);
    expect(refused.body.error.code).toBe("OPPORTUNITY_CLOSED");
  });

  it("hides a suspended mentor's opportunities, refuses applications and tells the mentor", async () => {
    const mentor = await makeMentor();
    const id = await publish(mentor, 5);
    const learner = await api.actor([RoleMode.WORKER]);
    expect(await inFeed(learner, id)).toBe(true);

    await api.app.get(LearningAdminService).setMentorSuspended(
      mentor.id,
      true,
      { reason: "Testing what suspension does." },
      {
        userId: (await api.actor([RoleMode.CUSTOMER])).id,
        email: "admin@kaj.test",
        role: AdminRole.ADMIN,
        sessionId: randomUUID(),
      },
      { ip: "127.0.0.1", ua: "w7-test" },
    );

    expect(await inFeed(learner, id)).toBe(false);
    const refused = await api
      .post(`learning-opportunities/${id}/applications`, learner)
      .expect(409);
    expect(refused.body.error.code).toBe("OPPORTUNITY_CLOSED");
    expect(
      await api.db.notification.count({
        where: { user_id: mentor.id, type: "MENTOR_SUSPENDED" },
      }),
    ).toBe(1);
  });
});
