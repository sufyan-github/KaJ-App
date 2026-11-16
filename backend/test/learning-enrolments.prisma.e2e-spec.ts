import { MentorStatus, RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.3: apply → accept (terms frozen) → three sessions recorded. */
databaseDescribe("learning enrolments and progress (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let learner: Actor;
  let second: Actor;
  let opportunityId: string;
  let applicationId: string;
  let secondApplicationId: string;
  let enrolmentId: string;
  const slot = futureSlot(12);

  beforeAll(async () => {
    api = await HttpHarness.start();
    mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER], {
      displayName: "Karim Mia",
    });
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    await api.db.user.update({
      where: { id: mentor.id },
      data: { role_modes: [RoleMode.CUSTOMER, RoleMode.MENTOR] },
    });
    learner = await api.actor([RoleMode.WORKER], { displayName: "Rina Das" });
    second = await api.actor([RoleMode.WORKER]);
    const [category, location] = await Promise.all([
      api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      }),
      api.db.location.findFirstOrThrow({ where: { is_active: true } }),
    ]);
    const created = await api
      .post("learning-opportunities", mentor, {
        opportunityType: "APPRENTICESHIP",
        title: "Tailoring apprenticeship",
        description: "Three months of tailoring with a monthly stipend.",
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
      .expect(201);
    opportunityId = created.body.data.id;
    await api
      .post(`learning-opportunities/${opportunityId}/publish`, mentor)
      .expect(201);
    applicationId = (
      await api
        .post(`learning-opportunities/${opportunityId}/applications`, learner, {
          message: "I sew at home and want to learn properly.",
        })
        .expect(201)
    ).body.data.id;
    secondApplicationId = (
      await api
        .post(`learning-opportunities/${opportunityId}/applications`, second)
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("shows the mentor their applicants, masked", async () => {
    const list = await api
      .get(`learning-opportunities/${opportunityId}/applications`, mentor)
      .expect(200);
    expect(list.body.data.items).toEqual([
      expect.objectContaining({
        id: applicationId,
        status: "PENDING",
        learner: expect.objectContaining({ displayName: "Rina D." }),
      }),
      expect.objectContaining({ id: secondApplicationId }),
    ]);
    // Only the mentor who owns it.
    await api
      .get(`learning-opportunities/${opportunityId}/applications`, learner)
      .expect(403);
  });

  it("enrols the learner with the terms, schedule and delivery mode frozen", async () => {
    const accepted = await api
      .post(`learning-applications/${applicationId}/accept`, mentor)
      .expect(201);
    enrolmentId = accepted.body.data.id;
    expect(accepted.body.data).toMatchObject({
      role: "MENTOR",
      status: "CONFIRMED",
      learner: { userId: learner.id, displayName: "Rina Das" },
      contract: {
        version: 1,
        kind: "LEARNING",
        opportunityType: "APPRENTICESHIP",
        terms: "STIPEND",
        stipendPoisha: "200000",
        termsText: { en: "Stipend: ৳2000", bn: "ভাতা: ৳২০০০" },
        deliveryMode: { code: "HYBRID", bn: "সরাসরি ও অনলাইনে" },
        schedule: { startsAt: slot.startsAt.toISOString() },
      },
      progress: { sessionsRecorded: 0 },
    });
    const contract = await api.db.contract.findFirstOrThrow({
      where: { assignment_id: enrolmentId },
    });
    // No platform fee on Learn.
    expect(contract.platform_fee_poisha).toBe(0n);

    // One seat: the second learner can't also be accepted, only declined.
    const full = await api
      .post(`learning-applications/${secondApplicationId}/accept`, mentor)
      .expect(409);
    expect(full.body.error.code).toBe("SEATS_FULL");
    await api
      .post(`learning-applications/${secondApplicationId}/decline`, mentor)
      .expect(201);
    expect(
      (
        await api.db.application.findUniqueOrThrow({
          where: { id: secondApplicationId },
        })
      ).status,
    ).toBe("REJECTED");

    // The work confirm route refuses a learning enrolment.
    await api.post(`assignments/${enrolmentId}/confirm`, learner).expect(409);
  });

  it("records three sessions as progress, confirmed by the learner", async () => {
    const day = 86_400_000;
    let last;
    for (const [index, topic] of [
      "Taking measurements",
      "Cutting a blouse pattern",
      "Machine stitching",
    ].entries()) {
      last = await api
        .post(`learning-enrolments/${enrolmentId}/sessions`, mentor, {
          heldAt: new Date(Date.now() - (3 - index) * day).toISOString(),
          minutes: 90,
          topic,
        })
        .expect(201);
    }
    expect(last!.body.data.progress).toEqual({
      sessionsRecorded: 3,
      sessionsConfirmed: 0,
      minutesTotal: 270,
    });

    const learnerView = await api
      .get(`learning-enrolments/${enrolmentId}`, learner)
      .expect(200);
    expect(learnerView.body.data.role).toBe("LEARNER");
    const [first, secondSession] = learnerView.body.data.sessions;
    await api
      .post(`learning-sessions/${first.id}/confirm`, learner)
      .expect(201);
    const confirmed = await api
      .post(`learning-sessions/${secondSession.id}/confirm`, learner)
      .expect(201);
    expect(confirmed.body.data.progress).toMatchObject({
      sessionsRecorded: 3,
      sessionsConfirmed: 2,
    });
    // Only the learner confirms; only the mentor records.
    await api.post(`learning-sessions/${first.id}/confirm`, mentor).expect(404);
    await api
      .post(`learning-enrolments/${enrolmentId}/sessions`, learner, {
        heldAt: new Date().toISOString(),
        minutes: 30,
        topic: "Self-recorded",
      })
      .expect(403);
    const future = await api
      .post(`learning-enrolments/${enrolmentId}/sessions`, mentor, {
        heldAt: new Date(Date.now() + 2 * day).toISOString(),
        minutes: 30,
        topic: "Not yet held",
      })
      .expect(409);
    expect(future.body.error.code).toBe("SESSION_IN_FUTURE");
  });

  it("lists enrolments for both sides and hides them from others", async () => {
    const mine = await api.get("learning-enrolments", learner).expect(200);
    expect(mine.body.data.items.map((item: { id: string }) => item.id)).toEqual(
      [enrolmentId],
    );
    const mentorList = await api.get("learning-enrolments", mentor).expect(200);
    expect(mentorList.body.data.items[0]).toMatchObject({
      id: enrolmentId,
      role: "MENTOR",
    });
    const outsider = await api.actor([RoleMode.WORKER]);
    await api.get(`learning-enrolments/${enrolmentId}`, outsider).expect(404);
  });
});
