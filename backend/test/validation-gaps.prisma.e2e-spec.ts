import { randomUUID } from "node:crypto";
import { MentorStatus, RoleMode, TrustLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R3 / W16: input that used to pass. Explicit null on a field that can't be
 * null, a budget whose minimum is above its maximum, a thana as a profile
 * area, an empty conversation report, a learning session dated long before
 * the enrolment, and a declined session invitation that could not be sent
 * again.
 */
databaseDescribe("validation gaps (real HTTP)", () => {
  let api: HttpHarness;
  let area: { id: string; parent_id: string | null };
  let categoryId: string;
  let skillId: string;

  const mentor = async () => {
    const actor = await api.actor([
      RoleMode.MENTOR,
      RoleMode.CUSTOMER,
      RoleMode.WORKER,
    ]);
    await api.db.profile.update({
      where: { user_id: actor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    return actor;
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    area = await api.db.location.findFirstOrThrow({
      where: { type: "AREA", is_active: true },
      select: { id: true, parent_id: true },
    });
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
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses explicit null for fields that can't be empty (400, not 500)", async () => {
    const owner = await api.actor([RoleMode.CUSTOMER]);
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    const ideaId = (
      await api
        .post("ideas", owner, {
          title: "Null test idea",
          summary: "An idea used only by the W16 test.",
          problem: "Inputs with null used to reach the database.",
          solution: "Refuse them at the door.",
          categoryId: sector.id,
        })
        .expect(201)
    ).body.data.id;
    for (const body of [
      { categoryId: null },
      { visibility: null },
      { title: null },
    ])
      await api.patch(`ideas/${ideaId}`, owner, body).expect(400);
    const approved = await mentor();
    await api.put("me/mentor", approved, { accepting: null }).expect(400);
  });

  it("refuses a budget whose minimum is above its maximum", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    const slot = futureSlot(19);
    const refused = await api
      .post("jobs", poster, {
        title: "Upside-down budget",
        description: "A job used only by the W16 test.",
        categoryId,
        skillIds: [skillId],
        locationId: area.id,
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "30000",
        budgetMaxPoisha: "20000",
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })
      .expect(400);
    expect(refused.body.error.field).toBe("budgetMaxPoisha");
  });

  it("asks for an area or thana, not the whole city, as the profile location", async () => {
    const user = await api.actor([RoleMode.WORKER]);
    const thana = await api.db.location.findUniqueOrThrow({
      where: { id: area.parent_id! },
    });
    const refused = await api
      .put("profiles/me", user, {
        displayName: "Area Test",
        primaryLocationId: thana.parent_id,
      })
      .expect(400);
    expect(refused.body.error.field).toBe("primaryLocationId");
    // The app lets people pick a thana, or an area.
    for (const id of [thana.id, area.id])
      await api
        .put("profiles/me", user, {
          displayName: "Area Test",
          primaryLocationId: id,
        })
        .expect(200);
  });

  it("refuses an empty conversation report", async () => {
    const first = await api.actor([RoleMode.CUSTOMER]);
    const second = await api.actor([RoleMode.WORKER]);
    const conversation = await api.db.conversation.create({
      data: {
        scope_key: `validation:${randomUUID()}`,
        participants: {
          create: [{ user_id: first.id }, { user_id: second.id }],
        },
      },
    });
    await api
      .post(`conversations/${conversation.id}/report`, first, {
        description: "",
      })
      .expect(400);
  });

  it("refuses a learning session dated long before the enrolment", async () => {
    const owner = await mentor();
    const slot = futureSlot(20);
    const opportunityId = (
      await api
        .post("learning-opportunities", owner, {
          opportunityType: "TRAINING",
          title: "Dating test training",
          description: "A training used only by the W16 test.",
          categoryId,
          skillIds: [],
          locationId: area.id,
          participantTerms: "FREE",
          seats: 2,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-opportunities/${opportunityId}/publish`, owner)
      .expect(201);
    const learner = await api.actor([RoleMode.WORKER]);
    const applicationId = (
      await api
        .post(`learning-opportunities/${opportunityId}/applications`, learner)
        .expect(201)
    ).body.data.id;
    const enrolmentId = (
      await api
        .post(`learning-applications/${applicationId}/accept`, owner)
        .expect(201)
    ).body.data.id;
    const refused = await api
      .post(`learning-enrolments/${enrolmentId}/sessions`, owner, {
        heldAt: new Date(Date.now() - 400 * DAY).toISOString(),
        minutes: 60,
        topic: "Measuring and cutting",
      })
      .expect(409);
    expect(refused.body.error.code).toBe("SESSION_BEFORE_ENROLMENT");
  });

  it("lets a host invite again someone who declined", async () => {
    const host = await mentor();
    const guest = await api.actor([RoleMode.WORKER]);
    const sessionId = (
      await api
        .post("sessions", host, {
          kind: "WORKSHOP",
          title: "Re-invite workshop",
          description: "For the W16 test.",
          startsAt: new Date(Date.now() + 4 * DAY).toISOString(),
          durationMinutes: 60,
          mode: "ONLINE",
          onlineLink: "https://meet.example.org/reinvite",
          capacity: 5,
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`sessions/${sessionId}/invite`, host, { userIds: [guest.id] })
      .expect(201);
    await api.post(`sessions/${sessionId}/publish`, host).expect(201);
    await api
      .post(`sessions/${sessionId}/respond`, guest, { accept: false })
      .expect(201);
    const again = await api
      .post(`sessions/${sessionId}/invite`, host, { userIds: [guest.id] })
      .expect(201);
    expect(again.body.data.invited ?? again.body.data).toBeDefined();
    const row = await api.db.sessionParticipant.findFirstOrThrow({
      where: { session_id: sessionId, user_id: guest.id },
    });
    expect(row.status).toBe("INVITED");
    await api
      .post(`sessions/${sessionId}/respond`, guest, { accept: true })
      .expect(201);
  });
});
