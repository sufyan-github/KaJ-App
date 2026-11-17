import { MentorStatus, RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1 leftovers: learners withdraw, and learning is reviewed both ways. */
databaseDescribe("learning withdrawal and reviews (real HTTP)", () => {
  let api: HttpHarness;
  let mentor: Actor;
  let opportunityId: string;
  const slot = futureSlot(15);

  const apply = async (learner: Actor) =>
    (
      await api
        .post(`learning-opportunities/${opportunityId}/applications`, learner)
        .expect(201)
    ).body.data.id as string;
  const accept = async (applicationId: string) =>
    (
      await api
        .post(`learning-applications/${applicationId}/accept`, mentor)
        .expect(201)
    ).body.data.id as string;
  const seatsFilled = async () =>
    (await api.db.job.findUniqueOrThrow({ where: { id: opportunityId } }))
      .workers_filled;
  const withdrawals = () =>
    api.db.notification.count({
      where: { user_id: mentor.id, type: "LEARNING_WITHDRAWN" },
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
    mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER], {
      displayName: "Nasima Begum",
    });
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    const [category, location] = await Promise.all([
      api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      }),
      api.db.location.findFirstOrThrow({ where: { is_active: true } }),
    ]);
    opportunityId = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title: "Mobile repair basics",
          description: "Four evenings of phone repair practice, free.",
          categoryId: category.id,
          skillIds: [],
          locationId: location.id,
          participantTerms: "FREE",
          seats: 3,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`learning-opportunities/${opportunityId}/publish`, mentor)
      .expect(201);
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("withdrawal", () => {
    it("withdraws before acceptance, tells the mentor, and allows applying again", async () => {
      const learner = await api.actor([RoleMode.WORKER]);
      const applicationId = await apply(learner);
      const before = await withdrawals();

      // Only the learner who applied.
      const outsider = await api.actor([RoleMode.WORKER]);
      await api
        .post(`learning-applications/${applicationId}/withdraw`, outsider)
        .expect(404);
      await api
        .post(`learning-applications/${applicationId}/withdraw`, mentor)
        .expect(404);

      const withdrawn = await api
        .post(`learning-applications/${applicationId}/withdraw`, learner, {
          reason: "Exams that week",
        })
        .expect(201);
      expect(withdrawn.body.data).toEqual({
        id: applicationId,
        status: "WITHDRAWN",
        enrolment: null,
      });
      expect(await withdrawals()).toBe(before + 1);
      // Twice changes nothing and sends nothing.
      await api
        .post(`learning-applications/${applicationId}/withdraw`, learner)
        .expect(201);
      expect(await withdrawals()).toBe(before + 1);

      // The mentor sees it and can't accept it.
      const list = await api
        .get(`learning-opportunities/${opportunityId}/applications`, mentor)
        .expect(200);
      expect(
        list.body.data.items.find(
          (item: { id: string }) => item.id === applicationId,
        ).status,
      ).toBe("WITHDRAWN");
      await api
        .post(`learning-applications/${applicationId}/accept`, mentor)
        .expect(409);

      // Applying again revives the same application.
      expect(await apply(learner)).toBe(applicationId);
      await api
        .post(`learning-applications/${applicationId}/withdraw`, learner)
        .expect(201);
    });

    it("withdraws after acceptance with no penalty, freeing the seat", async () => {
      const learner = await api.actor([RoleMode.WORKER]);
      const applicationId = await apply(learner);
      const enrolmentId = await accept(applicationId);
      const filled = await seatsFilled();
      const before = await withdrawals();

      // The mentor can't withdraw on the learner's behalf.
      await api
        .post(`learning-enrolments/${enrolmentId}/withdraw`, mentor)
        .expect(404);

      const response = await api
        .post(`learning-enrolments/${enrolmentId}/withdraw`, learner)
        .expect(201);
      expect(response.body.data).toMatchObject({
        id: enrolmentId,
        status: "CANCELLED",
        withdrawnAt: expect.any(String),
        completedAt: null,
      });
      expect(await seatsFilled()).toBe(filled - 1);
      expect(await withdrawals()).toBe(before + 1);
      const row = await api.db.assignment.findUniqueOrThrow({
        where: { id: enrolmentId },
        include: { application: true },
      });
      expect(row).toMatchObject({
        cancelled_by_user_id: learner.id,
        cancellation_penalised: false,
      });
      expect(row.application.status).toBe("WITHDRAWN");

      // Idempotent; and the enrolment is no longer active.
      await api
        .post(`learning-enrolments/${enrolmentId}/withdraw`, learner)
        .expect(201);
      expect(await seatsFilled()).toBe(filled - 1);
      const session = await api
        .post(`learning-enrolments/${enrolmentId}/sessions`, mentor, {
          heldAt: new Date(Date.now() - 3_600_000).toISOString(),
          minutes: 60,
          topic: "Opening the case",
        })
        .expect(409);
      expect(session.body.error.code).toBe("ENROLMENT_NOT_ACTIVE");

      // Leaving after acceptance is final for this opportunity.
      const again = await api
        .post(`learning-opportunities/${opportunityId}/applications`, learner)
        .expect(409);
      expect(again.body.error).toMatchObject({
        code: "REAPPLY_NOT_ALLOWED",
        messageKey: "error.learning.reapply_not_allowed",
      });
    });

    it("withdraws an accepted application through the application route too", async () => {
      const learner = await api.actor([RoleMode.WORKER]);
      const applicationId = await apply(learner);
      const enrolmentId = await accept(applicationId);
      const response = await api
        .post(`learning-applications/${applicationId}/withdraw`, learner)
        .expect(201);
      expect(response.body.data).toMatchObject({
        id: applicationId,
        status: "WITHDRAWN",
        enrolment: { id: enrolmentId, status: "CANCELLED" },
      });
    });

    it("refuses to withdraw a completed enrolment", async () => {
      const learner = await api.actor([RoleMode.WORKER]);
      const enrolmentId = await accept(await apply(learner));
      await completeEnrolment(enrolmentId, learner);
      const refused = await api
        .post(`learning-enrolments/${enrolmentId}/withdraw`, learner)
        .expect(409);
      expect(refused.body.error.code).toBe("ENROLMENT_NOT_ACTIVE");
    });
  });

  async function completeEnrolment(enrolmentId: string, learner: Actor) {
    const recorded = await api
      .post(`learning-enrolments/${enrolmentId}/sessions`, mentor, {
        heldAt: new Date(Date.now() - 3_600_000).toISOString(),
        minutes: 90,
        topic: "Replacing a charging port",
      })
      .expect(201);
    await api
      .post(
        `learning-sessions/${recorded.body.data.sessions[0].id}/confirm`,
        learner,
      )
      .expect(201);
    await api
      .post(`learning-enrolments/${enrolmentId}/complete`, mentor)
      .expect(201);
  }

  describe("reviews of learning", () => {
    let learner: Actor;
    let enrolmentId: string;
    const subject = () =>
      `reviews/subject?subjectType=LEARNING_ENROLMENT&subjectId=${enrolmentId}`;
    const review = (as: Actor, rating: number) =>
      api.post("reviews", as, {
        subjectType: "LEARNING_ENROLMENT",
        subjectId: enrolmentId,
        rating,
        comment: "Clear and patient.",
      });

    beforeAll(async () => {
      learner = await api.actor([RoleMode.WORKER], { displayName: "Mitu Roy" });
      enrolmentId = await accept(await apply(learner));
    });

    it("has nothing to review before completion", async () => {
      const state = await api.get(subject(), learner).expect(200);
      expect(state.body.data).toMatchObject({
        subjectType: "LEARNING_ENROLMENT",
        canReview: false,
        windowEndsAt: null,
      });
      await review(learner, 5).expect(409);
    });

    it("reviews learner and mentor double-blind after completion", async () => {
      await completeEnrolment(enrolmentId, learner);
      const open = await api.get(subject(), learner).expect(200);
      expect(open.body.data).toMatchObject({
        canReview: true,
        revealed: false,
        windowEndsAt: expect.any(String),
      });

      expect((await review(learner, 5).expect(201)).body.data).toEqual({
        submitted: true,
        revealed: false,
      });
      await review(learner, 4).expect(409);
      // The mentor can't see it before reviewing back.
      const blind = await api.get(subject(), mentor).expect(200);
      expect(blind.body.data).toMatchObject({
        canReview: true,
        revealed: false,
        receivedReview: null,
      });

      expect((await review(mentor, 4).expect(201)).body.data.revealed).toBe(
        true,
      );
      const learnerView = await api.get(subject(), learner).expect(200);
      expect(learnerView.body.data).toMatchObject({
        canReview: false,
        revealed: true,
        myReview: { rating: 5, subjectType: "LEARNING_ENROLMENT" },
        receivedReview: { rating: 4, reviewerUserId: mentor.id },
      });
      const received = await api.get("reviews/received", mentor).expect(200);
      expect(received.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            subjectType: "LEARNING_ENROLMENT",
            subjectId: enrolmentId,
            rating: 5,
          }),
        ]),
      );
    });

    it("keeps learning reviews out of the work rating", async () => {
      const profile = await api.db.workerProfile.findUnique({
        where: { user_id: learner.id },
      });
      expect(profile?.rating_count ?? 0).toBe(0);
    });

    it("is private to the two sides, and not a work assignment", async () => {
      const outsider = await api.actor([RoleMode.WORKER]);
      await api.get(subject(), outsider).expect(404);
      await review(outsider, 1).expect(404);
      const asWork = await api
        .get(`assignments/${enrolmentId}/reviews`, learner)
        .expect(409);
      expect(asWork.body.error.code).toBe("NOT_A_WORK_JOB");
      await api
        .post(`assignments/${enrolmentId}/reviews`, learner, { rating: 5 })
        .expect(409);
    });
  });
});
