import { randomUUID } from "node:crypto";
import { AdminRole, MentorStatus, RoleMode } from "@prisma/client";
import request from "supertest";

import { LearningAdminService } from "../src/modules/learning/learning-admin.service";
import { TrainingAdminService } from "../src/modules/training/training-admin.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P1.5: course authoring, learning moderation, mentor suspension. */
databaseDescribe("Learn admin (services + real HTTP)", () => {
  let api: HttpHarness;
  let courses: TrainingAdminService;
  let learning: LearningAdminService;
  let admin: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };
  let learner: Actor;
  const context = { ip: "127.0.0.1", ua: "learn-admin-test" };
  const slug = `admin-course-${randomUUID().slice(0, 8)}`;

  const document = (extra: Record<string, unknown> = {}) => ({
    slug,
    skillSlug: null,
    titleEn: "Safe ladder use",
    titleBn: "নিরাপদে মই ব্যবহার",
    summaryEn: "How to set up and climb a ladder safely.",
    summaryBn: "কীভাবে নিরাপদে মই বসাবেন ও উঠবেন।",
    minutes: 10,
    estDataMb: 5,
    passMarkPct: 70,
    questionCount: 1,
    // Locked-order publishing (checkpoints) is covered in lesson-steps tests.
    isSafetyCritical: false,
    sortOrder: 0,
    lessons: [
      {
        titleEn: "Setting up",
        titleBn: "মই বসানো",
        summaryEn: "Angle and footing.",
        summaryBn: "কোণ ও ভিত্তি।",
        youtubeVideoId: null,
        durationS: 120,
        isSafety: true,
      },
    ],
    questions: [
      {
        promptEn: "What angle should a ladder lean at?",
        promptBn: "মই কোন কোণে হেলানো উচিত?",
        options: [
          { id: "a", en: "About 75 degrees", bn: "প্রায় ৭৫ ডিগ্রি" },
          { id: "b", en: "About 30 degrees", bn: "প্রায় ৩০ ডিগ্রি" },
        ],
        correctOptionId: "a",
        explanationEn: "One out for every four up.",
        explanationBn: "প্রতি চার উচ্চতায় এক দূরত্ব।",
      },
    ],
    ...extra,
  });

  beforeAll(async () => {
    api = await HttpHarness.start();
    courses = api.app.get(TrainingAdminService);
    learning = api.app.get(LearningAdminService);
    const adminUser = await api.actor([RoleMode.CUSTOMER]);
    admin = {
      userId: adminUser.id,
      email: "learn-admin@kaj.test",
      role: AdminRole.ADMIN,
      sessionId: randomUUID(),
    };
    learner = await api.actor([RoleMode.WORKER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("course authoring", () => {
    let courseId: string;
    const visible = async () =>
      (
        await api.get("training/courses?scope=all", learner).expect(200)
      ).body.data.items.some((item: { id: string }) => item.id === courseId);

    it("creates an unpublished course and round-trips the document", async () => {
      const created = await courses.create(
        document(),
        "Course change for the test.",
        admin,
        context,
      );
      courseId = created.id;
      expect(created).toMatchObject({ version: 1, isPublished: false });
      expect(created.document).toMatchObject({
        slug,
        titleBn: "নিরাপদে মই ব্যবহার",
        questions: [expect.objectContaining({ correctOptionId: "a" })],
      });
      expect(await visible()).toBe(false);
      await expect(
        courses.create(
          document(),
          "Course change for the test.",
          admin,
          context,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COURSE_SLUG_TAKEN" }),
      });
    });

    it("bumps the version only when lessons or questions change", async () => {
      const same = await courses.update(
        courseId,
        document(),
        "Course change for the test.",
        admin,
        context,
      );
      expect(same).toMatchObject({ outcome: "unchanged", version: 1 });
      const renamed = await courses.update(
        courseId,
        document({ titleEn: "Using a ladder safely" }),
        "Course change for the test.",
        admin,
        context,
      );
      expect(renamed).toMatchObject({ outcome: "updated", version: 1 });
      const changed = await courses.update(
        courseId,
        document({
          titleEn: "Using a ladder safely",
          questions: [
            {
              ...document().questions[0],
              promptEn: "At what angle should a ladder lean?",
            },
          ],
        }),
        "Course change for the test.",
        admin,
        context,
      );
      expect(changed).toMatchObject({ outcome: "versionBumped", version: 2 });
      // The replaced question is kept, inactive, for old attempts.
      expect(
        await api.db.trainingQuestion.count({
          where: { course_id: courseId, is_active: false },
        }),
      ).toBe(1);
      expect(
        await api.db.auditLog.count({
          where: { entity_id: courseId, action: "ADMIN_COURSE_UPDATED" },
        }),
      ).toBe(2);
    });

    it("validates the document with the content rules", async () => {
      await expect(
        courses.update(
          courseId,
          document({ slug: "another-slug" }),
          "Course change for the test.",
          admin,
          context,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: "COURSE_SLUG_IMMUTABLE" }),
      });
      await expect(
        courses.update(
          courseId,
          document({ questions: [] }),
          "Course change for the test.",
          admin,
          context,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "VALIDATION_FAILED",
          field: "questions",
        }),
      });
    });

    it("publishes to the app and unpublishes, audited", async () => {
      await courses.setPublished(
        courseId,
        true,
        "Reviewed by the safety lead.",
        admin,
        context,
      );
      expect(await visible()).toBe(true);
      await courses.setPublished(
        courseId,
        false,
        "Pulled for a correction.",
        admin,
        context,
      );
      expect(await visible()).toBe(false);
      const listed = await courses.list();
      expect(listed.items.find((item) => item.id === courseId)).toMatchObject({
        version: 2,
        isPublished: false,
        lessons: 1,
        activeQuestions: 1,
      });
    });
  });

  describe("learning moderation and mentors", () => {
    let mentor: Actor;
    let opportunityId: string;

    beforeAll(async () => {
      mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
      await api.db.profile.update({
        where: { user_id: mentor.id },
        data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
      });
      await api.db.user.update({
        where: { id: mentor.id },
        data: { role_modes: [RoleMode.CUSTOMER, RoleMode.MENTOR] },
      });
      const [category, location] = await Promise.all([
        api.db.category.findFirstOrThrow({ where: { is_active: true } }),
        api.db.location.findFirstOrThrow({ where: { is_active: true } }),
      ]);
      const slot = futureSlot(15);
      opportunityId = (
        await api
          .post("learning-opportunities", mentor, {
            opportunityType: "TRAINING",
            title: "Moderation test training",
            description: "A synthetic training for the moderation test.",
            categoryId: category.id,
            skillIds: [],
            locationId: location.id,
            participantTerms: "UNPAID",
            seats: 1,
            startsAt: slot.startsAt.toISOString(),
            endsAt: slot.endsAt.toISOString(),
          })
          .expect(201)
      ).body.data.id;
      await api
        .post(`learning-opportunities/${opportunityId}/publish`, mentor)
        .expect(201);
    });

    const inFeed = async () =>
      (
        await api.get("learning-opportunities?limit=100", learner).expect(200)
      ).body.data.items.some(
        (item: { id: string }) => item.id === opportunityId,
      );

    it("suspends an opportunity out of the Learn feed and restores it", async () => {
      const listed = await learning.opportunities({
        search: "Moderation test training",
      });
      expect(listed.items[0]).toMatchObject({
        id: opportunityId,
        status: "APPLICATIONS_OPEN",
        actions: ["suspend"],
        termsText: { en: "Unpaid (no fee, no stipend)" },
      });
      await learning.suspendOpportunity(
        opportunityId,
        { reason: "Reported for misleading terms." },
        admin,
        context,
      );
      expect(await inFeed()).toBe(false);
      await learning.restoreOpportunity(
        opportunityId,
        { reason: "Terms clarified with the mentor." },
        admin,
        context,
      );
      expect(await inFeed()).toBe(true);
      expect(
        await api.db.auditLog.count({
          where: {
            entity_id: opportunityId,
            action: {
              in: ["ADMIN_LEARNING_SUSPENDED", "ADMIN_LEARNING_RESTORED"],
            },
          },
        }),
      ).toBe(2);
    });

    it("suspends a mentor (no new publishing) and reinstates them", async () => {
      await learning.setMentorSuspended(
        mentor.id,
        true,
        { reason: "Several safety reports." },
        admin,
        context,
      );
      const draft = await api.db.job.create({
        data: {
          poster_user_id: mentor.id,
          opportunity_type: "TRAINING",
          participant_terms: "FREE",
          title: "Draft while suspended",
          description: "Should not be publishable while suspended.",
          category_id: (await api.db.category.findFirstOrThrow()).id,
          location_id: (await api.db.location.findFirstOrThrow()).id,
          job_type: "ONE_TIME",
          payment_model: "FIXED",
        },
      });
      const blocked = await api
        .post(`learning-opportunities/${draft.id}/publish`, mentor)
        .expect(403);
      expect(blocked.body.error.code).toBe("MENTOR_SUSPENDED");
      await learning.setMentorSuspended(
        mentor.id,
        false,
        { reason: "Reviewed; reports not upheld." },
        admin,
        context,
      );
      expect(
        (
          await api.db.profile.findUniqueOrThrow({
            where: { user_id: mentor.id },
          })
        ).mentor_status,
      ).toBe("APPROVED");
    });

    it("shows a user's learning in the admin user view", async () => {
      const applicationId = (
        await api
          .post(`learning-opportunities/${opportunityId}/applications`, learner)
          .expect(201)
      ).body.data.id;
      const enrolmentId = (
        await api
          .post(`learning-applications/${applicationId}/accept`, mentor)
          .expect(201)
      ).body.data.id;
      await api
        .post(`learning-enrolments/${enrolmentId}/sessions`, mentor, {
          heldAt: new Date(Date.now() - 3_600_000).toISOString(),
          minutes: 45,
          topic: "Introduction",
        })
        .expect(201);
      const view = await learning.userLearning(learner.id);
      expect(view.enrolments).toEqual([
        expect.objectContaining({
          id: enrolmentId,
          role: "LEARNER",
          progress: {
            sessionsRecorded: 1,
            sessionsConfirmed: 0,
            minutesTotal: 45,
          },
        }),
      ]);
    });

    it("keeps every admin route behind an admin session", async () => {
      for (const path of [
        "admin/learning-opportunities",
        "admin/training/courses",
        "admin/certificates",
        `admin/users/${learner.id}/learning`,
      ])
        await request(api.app.getHttpServer())
          .get(`/api/v1/${path}`)
          .expect(401);
    });
  });
});
