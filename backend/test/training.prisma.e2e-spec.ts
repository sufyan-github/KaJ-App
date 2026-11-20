import "reflect-metadata";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { RoleMode, TrustLevel } from "@prisma/client";
import request from "supertest";

import { configureApp } from "../src/app.bootstrap";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AuthTokenService } from "../src/modules/auth/auth-token.service";
import { MatchingService } from "../src/modules/matching/matching.service";
import {
  loadTrainingContent,
  type TrainingContent,
} from "../src/modules/training/content/training-content.loader";

const databaseDescribe =
  process.env.TRAINING_DATABASE_E2E === "1" ? describe : describe.skip;

type Actor = { id: string; token: string };
type Course = { id: string; slug: string; [key: string]: unknown };

// Real HTTP + PostgreSQL + Redis journeys for the training MVP and quick wins.
databaseDescribe("training MVP and quick wins with PostgreSQL", () => {
  let app: INestApplication;
  let db: PrismaService;
  const runId = randomUUID().slice(0, 8);
  const slug = (base: string) => `${base}-${runId}`;
  const userIds: string[] = [];
  const courseSlugs: string[] = [];
  let content: TrainingContent;
  let cleaningSkillId: string;
  let categoryId: string;
  let areaIds: string[];
  let worker: Actor;
  let rival: Actor;
  let customer: Actor;
  let stranger: Actor;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, "127.0.0.1");
    db = app.get(PrismaService);

    const cleaning = await db.skill.findUniqueOrThrow({
      where: { slug: "cleaning" },
    });
    cleaningSkillId = cleaning.id;
    categoryId = cleaning.category_id;
    areaIds = (
      await db.location.findMany({
        where: { type: "AREA", is_active: true },
        orderBy: { name_en: "asc" },
        take: 12,
      })
    ).map((area) => area.id);

    const fixture = JSON.parse(
      readFileSync(
        join(__dirname, "fixtures/training-content.fixture.json"),
        "utf8",
      ),
    ) as TrainingContent;
    // Unique slugs keep this run apart from real content in the same DB.
    for (const course of fixture.courses) {
      course.slug = slug(course.slug);
      courseSlugs.push(course.slug);
    }
    content = fixture;
    const loaded = await loadTrainingContent(db, content, { publish: true });
    expect(loaded.created).toEqual(courseSlugs);

    worker = await actor(RoleMode.WORKER, "Arif Hossain");
    rival = await actor(RoleMode.WORKER, "Rina Akter");
    customer = await actor(RoleMode.CUSTOMER, "Karim Mia");
    stranger = await actor(RoleMode.WORKER, "Shila Das");
    await db.userSkill.createMany({
      data: [worker, rival].map((item) => ({
        user_id: item.id,
        skill_id: cleaningSkillId,
      })),
    });
  });

  afterAll(async () => {
    if (db) {
      const jobs = await db.job.findMany({
        where: { poster_user_id: { in: userIds } },
        select: { id: true },
      });
      const jobIds = jobs.map((job) => job.id);
      await db.assignment.deleteMany({ where: { job_id: { in: jobIds } } });
      await db.application.deleteMany({ where: { job_id: { in: jobIds } } });
      await db.job.deleteMany({ where: { id: { in: jobIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await db.trainingCourse.deleteMany({
        where: { slug: { in: courseSlugs } },
      });
    }
    await app?.close();
  });

  async function actor(role: RoleMode, name: string): Promise<Actor> {
    const user = await db.user.create({
      data: {
        phone_e164: `+88018${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        role_modes: [role],
        active_role: role,
        profile: {
          create: { display_name: name, trust_level: TrustLevel.PHONE },
        },
        worker_profile: role === RoleMode.WORKER ? { create: {} } : undefined,
      },
    });
    userIds.push(user.id);
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

  const http = () => request(app.getHttpServer());
  const get = (path: string, who?: Actor) => {
    const call = http().get(`/api/v1/${path}`);
    return who ? call.auth(who.token, { type: "bearer" }) : call;
  };
  const post = (path: string, who: Actor, body: object = {}) =>
    http()
      .post(`/api/v1/${path}`)
      .auth(who.token, { type: "bearer" })
      .send(body);
  const del = (path: string, who: Actor) =>
    http().delete(`/api/v1/${path}`).auth(who.token, { type: "bearer" });

  async function courses(who: Actor, scope?: "mine" | "all") {
    const response = await get(
      `training/courses${scope ? `?scope=${scope}` : ""}`,
      who,
    ).expect(200);
    return (response.body.data.items as Course[]).filter((item) =>
      courseSlugs.includes(item.slug),
    );
  }
  const courseId = async (base: string) =>
    (
      await db.trainingCourse.findUniqueOrThrow({
        where: { slug: slug(base) },
      })
    ).id;
  type Started = {
    attemptId: string;
    questions: Array<{ id: string; options: Array<{ id: string }> }>;
  };
  const answerAll = (attempt: Started, optionId: string) => ({
    answers: attempt.questions.map((question) => ({
      questionId: question.id,
      optionId,
    })),
  });

  it("lists my skill and general courses for mine, and everything ranked for all", async () => {
    const mine = await courses(worker);
    expect(mine.map((item) => [item.slug, item.relevance])).toEqual([
      [slug("fixture-cleaning-basics"), "MY_SKILL"],
      [slug("fixture-general-conduct"), "GENERAL"],
    ]);
    const all = await courses(worker, "all");
    expect(all.map((item) => item.relevance)).toEqual([
      "MY_SKILL",
      "GENERAL",
      "OTHER",
    ]);
    expect(all[0]).toMatchObject({
      minutes: 15,
      estDataMb: 30,
      lessonCount: 2,
      passMarkPct: 70,
      questionCount: 4,
      isSafetyCritical: false,
      skill: { id: cleaningSkillId, slug: "cleaning" },
      progress: { lessonsOpened: 0, lessonCount: 2 },
      certificate: null,
      attemptsLeftToday: 3,
      nextAttemptAt: null,
    });
    expect(all[2]).toMatchObject({ isSafetyCritical: true });
    // A customer has no skills: skill courses are OTHER for them.
    expect((await courses(customer)).map((item) => item.relevance)).toEqual([
      "GENERAL",
    ]);
  });

  it("records a private lesson open and nothing else", async () => {
    const id = await courseId("fixture-cleaning-basics");
    const detail = await get(`training/courses/${id}`, worker).expect(200);
    const lessons = detail.body.data.lessons as Array<{
      id: string;
      opened: boolean;
      youtubeVideoId: string | null;
    }>;
    expect(lessons).toHaveLength(2);
    expect(lessons[1]!.youtubeVideoId).toBeNull();
    expect(lessons.every((lesson) => !lesson.opened)).toBe(true);
    const notificationsBefore = await db.notification.count({
      where: { user_id: worker.id },
    });

    await post(`training/lessons/${lessons[0]!.id}/open`, worker).expect(204);
    await post(`training/lessons/${lessons[0]!.id}/open`, worker).expect(204);

    const after = await get(`training/courses/${id}`, worker).expect(200);
    expect(after.body.data.progress).toEqual({
      lessonsOpened: 1,
      lessonCount: 2,
    });
    expect(after.body.data.lessons[0].opened).toBe(true);
    expect(
      await db.trainingLessonOpen.count({ where: { user_id: worker.id } }),
    ).toBe(1);
    expect(await db.notification.count({ where: { user_id: worker.id } })).toBe(
      notificationsBefore,
    );
    expect(
      await db.trainingCertificate.count({ where: { user_id: worker.id } }),
    ).toBe(0);
    // Progress is private to the person who opened the lesson.
    const other = await get(`training/courses/${id}`, rival).expect(200);
    expect(other.body.data.progress.lessonsOpened).toBe(0);
    await post(`training/lessons/${randomUUID()}/open`, worker).expect(404);
  });

  it("hides unpublished courses and their lessons", async () => {
    const hidden = structuredClone(content.courses[1]!);
    hidden.slug = slug("fixture-hidden");
    courseSlugs.push(hidden.slug);
    const result = await loadTrainingContent(
      db,
      { courses: [hidden] },
      { publish: false },
    );
    expect(result.created).toEqual([hidden.slug]);
    const course = await db.trainingCourse.findUniqueOrThrow({
      where: { slug: hidden.slug },
      include: { lessons: true },
    });
    expect(course.is_published).toBe(false);
    await get(`training/courses/${course.id}`, worker).expect(404);
    await post(`training/courses/${course.id}/attempts`, worker).expect(404);
    await post(`training/lessons/${course.lessons[0]!.id}/open`, worker).expect(
      404,
    );
    expect(
      (await courses(worker, "all")).map((item) => item.slug),
    ).not.toContain(hidden.slug);
  });

  it("starts a test without answers and returns the open attempt again", async () => {
    const id = await courseId("fixture-cleaning-basics");
    const first = await post(`training/courses/${id}/attempts`, worker).expect(
      201,
    );
    const attempt = first.body.data as Started & { expiresAt: string };
    expect(attempt.questions).toHaveLength(4);
    expect(new Set(attempt.questions.map((q) => q.id)).size).toBe(4);
    const serialized = JSON.stringify(first.body.data);
    expect(serialized).not.toMatch(/correct|explanation/i);
    const minutes =
      (new Date(attempt.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(19);
    expect(minutes).toBeLessThanOrEqual(20);

    const again = await post(`training/courses/${id}/attempts`, worker).expect(
      201,
    );
    expect(again.body.data).toEqual(first.body.data);
    expect(
      await db.trainingAttempt.count({
        where: { user_id: worker.id, course_id: id },
      }),
    ).toBe(1);
  });

  it("keeps attempts private and validates answers", async () => {
    const id = await courseId("fixture-cleaning-basics");
    const attempt = (await post(`training/courses/${id}/attempts`, worker)).body
      .data as Started;
    await post(
      `training/attempts/${attempt.attemptId}/submit`,
      rival,
      answerAll(attempt, "a"),
    ).expect(404);
    const unknown = await post(
      `training/attempts/${attempt.attemptId}/submit`,
      worker,
      { answers: [{ questionId: randomUUID(), optionId: "a" }] },
    ).expect(400);
    expect(unknown.body.error.code).toBe("TRAINING_ANSWER_INVALID");
    await post(`training/attempts/${attempt.attemptId}/submit`, worker, {
      answers: [
        { questionId: attempt.questions[0]!.id, optionId: "a" },
        { questionId: attempt.questions[0]!.id, optionId: "b" },
      ],
    }).expect(400);
    await post(`training/attempts/${attempt.attemptId}/submit`, worker, {
      answers: [{ questionId: attempt.questions[0]!.id, optionId: "z" }],
    }).expect(400);
    // Rejected submissions leave the attempt open.
    const row = await db.trainingAttempt.findUniqueOrThrow({
      where: { id: attempt.attemptId },
    });
    expect(row.submitted_at).toBeNull();
  });

  it("grades a pass, issues exactly one certificate and notification", async () => {
    const id = await courseId("fixture-cleaning-basics");
    const attempt = (await post(`training/courses/${id}/attempts`, worker)).body
      .data as Started;
    const response = await post(
      `training/attempts/${attempt.attemptId}/submit`,
      worker,
      answerAll(attempt, "a"),
    ).expect(201);
    const result = response.body.data;
    expect(result).toMatchObject({
      scorePct: 100,
      passed: true,
      passMarkPct: 70,
      certificate: {
        courseId: id,
        evidenceLevel: "KNOWLEDGE_TESTED",
        scorePct: 100,
        status: "VALID",
        isSafetyCritical: false,
        skill: { slug: "cleaning" },
      },
    });
    expect(result.results).toHaveLength(4);
    expect(result.results[0]).toMatchObject({
      correct: true,
      correctOptionId: "a",
      explanationEn: expect.any(String),
      explanationBn: expect.any(String),
    });
    expect(result.certificate.code).toMatch(
      /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/,
    );
    expect(result.certificate.verifyPath).toBe(
      `/api/v1/certificates/${result.certificate.code}`,
    );

    expect(
      await db.trainingCertificate.count({ where: { user_id: worker.id } }),
    ).toBe(1);
    const notifications = await db.notification.findMany({
      where: { user_id: worker.id, type: "TRAINING_CERTIFICATE_ISSUED" },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.payload_json).toMatchObject({
      route: "/training/certificates",
    });

    const resubmit = await post(
      `training/attempts/${attempt.attemptId}/submit`,
      worker,
      answerAll(attempt, "a"),
    ).expect(409);
    expect(resubmit.body.error.code).toBe("TRAINING_ATTEMPT_SUBMITTED");
    const restart = await post(
      `training/courses/${id}/attempts`,
      worker,
    ).expect(409);
    expect(restart.body.error.code).toBe("TRAINING_ALREADY_CERTIFIED");

    const summary = (await courses(worker)).find((item) => item.id === id)!;
    expect(summary.certificate).toMatchObject({
      code: result.certificate.code,
    });
    const mine = await get("me/certificates", worker).expect(200);
    expect(mine.body.data.items).toEqual([result.certificate]);
  });

  it("verifies a certificate publicly without personal details", async () => {
    const certificate = await db.trainingCertificate.findFirstOrThrow({
      where: { user_id: worker.id },
    });
    const response = await get(
      `certificates/${certificate.public_code.toLowerCase()}`,
    ).expect(200);
    expect(response.body.data).toEqual({
      code: certificate.public_code,
      // A quiz certificate: no mentor, no separate skill (P1.4 fields).
      kind: "QUIZ",
      skill: null,
      issuedByName: null,
      holderName: "Arif H.",
      courseTitleEn: "Fixture cleaning basics",
      courseTitleBn: "নমুনা পরিষ্কারের মৌলিক বিষয়",
      evidenceLevel: "KNOWLEDGE_TESTED",
      isSafetyCritical: false,
      issuedAt: certificate.issued_at.toISOString(),
      status: "VALID",
    });
    const phone = (
      await db.user.findUniqueOrThrow({ where: { id: worker.id } })
    ).phone_e164!;
    expect(JSON.stringify(response.body)).not.toContain(phone.slice(-8));
    expect(JSON.stringify(response.body)).not.toContain("Hossain");
    const missing = await get("certificates/ZZZZZZZZZZ").expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    await get("certificates/not-a-code!").expect(404);
  });

  it("shows valid certificates on the public worker profile", async () => {
    // API-6: public profiles need a sign-in.
    const response = await get(`users/${worker.id}/public`, stranger).expect(
      200,
    );
    expect(response.body.data.trainings).toEqual([
      {
        kind: "QUIZ",
        courseTitleEn: "Fixture cleaning basics",
        courseTitleBn: "নমুনা পরিষ্কারের মৌলিক বিষয়",
        skillSlug: "cleaning",
        evidenceLevel: "KNOWLEDGE_TESTED",
        issuedAt: expect.any(String),
        isSafetyCritical: false,
      },
    ]);
    const other = await get(`users/${rival.id}/public`, stranger).expect(200);
    expect(other.body.data.trainings).toEqual([]);
  });

  it("blocks a fourth test after three failures in a day", async () => {
    const id = await courseId("fixture-general-conduct");
    for (let index = 0; index < 3; index += 1) {
      const attempt = (
        await post(`training/courses/${id}/attempts`, rival).expect(201)
      ).body.data as Started;
      const graded = await post(
        `training/attempts/${attempt.attemptId}/submit`,
        rival,
        answerAll(attempt, "a"),
      ).expect(201);
      expect(graded.body.data).toMatchObject({
        scorePct: 0,
        passed: false,
        certificate: null,
      });
    }
    const blocked = await post(`training/courses/${id}/attempts`, rival).expect(
      409,
    );
    expect(blocked.body.error.code).toBe("TRAINING_ATTEMPT_LIMIT");
    const nextAttemptAt = blocked.body.error.details[0].nextAttemptAt as string;
    const hours = (new Date(nextAttemptAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23.5);
    expect(hours).toBeLessThanOrEqual(24);
    const summary = (await courses(rival)).find((item) => item.id === id)!;
    expect(summary).toMatchObject({ attemptsLeftToday: 0, nextAttemptAt });
    expect(
      await db.trainingCertificate.count({ where: { user_id: rival.id } }),
    ).toBe(0);
  });

  it("refuses to grade an expired attempt", async () => {
    const id = await courseId("fixture-electrical-safety");
    const attempt = (
      await post(`training/courses/${id}/attempts`, worker).expect(201)
    ).body.data as Started;
    await db.trainingAttempt.update({
      where: { id: attempt.attemptId },
      data: { expires_at: new Date(Date.now() - 1_000) },
    });
    const response = await post(
      `training/attempts/${attempt.attemptId}/submit`,
      worker,
      answerAll(attempt, "c"),
    ).expect(409);
    expect(response.body.error.code).toBe("TRAINING_ATTEMPT_EXPIRED");
    // An expired attempt is not reused: a new one starts.
    const fresh = await post(`training/courses/${id}/attempts`, worker).expect(
      201,
    );
    expect(fresh.body.data.attemptId).not.toBe(attempt.attemptId);
  });

  it("reports profile completeness for a worker and a customer", async () => {
    const workerProfile = await get("profiles/me", worker).expect(200);
    expect(workerProfile.body.data).toMatchObject({
      displayName: "Arif Hossain",
      photoUrl: null,
      primaryLocation: null,
      trustLevel: "PHONE",
      roles: ["WORKER"],
      activeRole: "WORKER",
      skills: [
        {
          skillId: cleaningSkillId,
          slug: "cleaning",
          level: "BEGINNER",
          hasPriorTraining: false,
        },
      ],
      completeness: {
        percent: 35,
        missing: ["PHOTO", "BIO", "AREA", "IDENTITY"],
      },
    });
    expect(workerProfile.body.data.certificates).toHaveLength(1);

    await db.profile.update({
      where: { user_id: customer.id },
      data: { primary_location_id: areaIds[0], bio: "Customer bio" },
    });
    const customerProfile = await get("profiles/me", customer).expect(200);
    expect(customerProfile.body.data).toMatchObject({
      activeRole: "CUSTOMER",
      primaryLocation: { id: areaIds[0] },
      skills: [],
      certificates: [],
      completeness: { percent: 40, missing: ["PHOTO", "IDENTITY"] },
    });
  });

  it("stores and returns the prior-training answer on worker skills", async () => {
    await http()
      .put("/api/v1/profiles/me/skills")
      .auth(rival.token, { type: "bearer" })
      .send({
        skills: [
          {
            skillId: cleaningSkillId,
            level: "INTERMEDIATE",
            years: 2,
            hasPriorTraining: true,
          },
        ],
      })
      .expect(200);
    // Omitting the flag later keeps the stored answer.
    await http()
      .put("/api/v1/profiles/me/skills")
      .auth(rival.token, { type: "bearer" })
      .send({
        skills: [{ skillId: cleaningSkillId, level: "EXPERT", years: 5 }],
      })
      .expect(200);
    const skills = await get("profiles/me/skills", rival).expect(200);
    expect(skills.body.data).toEqual([
      expect.objectContaining({
        skillId: cleaningSkillId,
        level: "EXPERT",
        years: "5",
        hasPriorTraining: true,
      }),
    ]);
  });

  it("manages job alerts with a limit and duplicate check", async () => {
    const created = await post("me/job-alerts", stranger, {
      skillId: cleaningSkillId,
    }).expect(201);
    expect(created.body.data).toMatchObject({
      categoryId: null,
      skillId: cleaningSkillId,
      locationId: null,
      labelEn: "Cleaning",
      labelBn: "পরিষ্কার করা",
    });
    const duplicate = await post("me/job-alerts", stranger, {
      skillId: cleaningSkillId,
    }).expect(409);
    expect(duplicate.body.error.code).toBe("JOB_ALERT_DUPLICATE");
    await post("me/job-alerts", stranger, {}).expect(400);
    await post("me/job-alerts", stranger, { skillId: randomUUID() }).expect(
      400,
    );

    for (const areaId of areaIds.slice(0, 9)) {
      await post("me/job-alerts", stranger, { locationId: areaId }).expect(201);
    }
    const limited = await post("me/job-alerts", stranger, {
      locationId: areaIds[10],
    }).expect(409);
    expect(limited.body.error.code).toBe("JOB_ALERT_LIMIT");

    const list = await get("me/job-alerts", stranger).expect(200);
    expect(list.body.data.items).toHaveLength(10);
    await del(`me/job-alerts/${created.body.data.id}`, customer).expect(404);
    await del(`me/job-alerts/${created.body.data.id}`, stranger).expect(204);
    await del(`me/job-alerts/${created.body.data.id}`, stranger).expect(404);
    expect(
      (await get("me/job-alerts", stranger).expect(200)).body.data.items,
    ).toHaveLength(9);
  });

  it("notifies matching alerts on publish and hides drafts from strangers", async () => {
    const watcher = await actor(RoleMode.WORKER, "Watcher One");
    const elsewhere = await actor(RoleMode.WORKER, "Watcher Two");
    const jobArea = areaIds[11]!;
    await post("me/job-alerts", watcher, {
      skillId: cleaningSkillId,
      locationId: jobArea,
    }).expect(201);
    await post("me/job-alerts", elsewhere, {
      skillId: cleaningSkillId,
      locationId: areaIds[0],
    }).expect(201);
    await post("me/job-alerts", customer, {
      skillId: cleaningSkillId,
    }).expect(201);

    const startsAt = new Date(Date.now() + 2 * 86_400_000);
    const job = await post("jobs", customer, {
      title: "Clean a two-room flat",
      description: "Sweep and mop two rooms and clean the kitchen sink.",
      categoryId,
      locationId: jobArea,
      skillIds: [cleaningSkillId],
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      budgetMinPoisha: "50000",
      budgetMaxPoisha: "80000",
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString(),
      lat: 24.37,
      lng: 88.6,
    }).expect(201);
    const jobId = job.body.data.id as string;

    await get(`jobs/${jobId}`, stranger).expect(404);
    const own = await get(`jobs/${jobId}`, customer).expect(200);
    expect(own.body.data).toMatchObject({
      status: "DRAFT",
      viewerIsPoster: true,
      viewerApplicationStatus: null,
      poster: {
        id: customer.id,
        displayName: "Karim Mia",
        trustLevel: "PHONE",
        badges: [],
      },
    });

    await post(`jobs/${jobId}/publish`, customer).expect(201);

    const alerts = await db.notification.findMany({
      where: {
        type: "JOB_ALERT_MATCH",
        user_id: { in: userIds },
        payload_json: { path: ["jobId"], equals: jobId },
      },
    });
    expect(alerts.map((item) => item.user_id)).toEqual([watcher.id]);
    expect(alerts[0]!.payload_json).toMatchObject({
      route: `/jobs/${jobId}`,
      jobId,
      dedupeKey: expect.stringMatching(new RegExp(`^job-alert:.+:${jobId}$`)),
    });

    const open = await get(`jobs/${jobId}`, stranger).expect(200);
    expect(open.body.data).toMatchObject({
      viewerIsPoster: false,
      viewerApplicationStatus: null,
      poster: { displayName: "Karim M." },
    });
    expect(open.body.data).not.toHaveProperty("lat");
    expect(open.body.data).not.toHaveProperty("lng");
    expect(JSON.stringify(open.body.data)).not.toContain("88.6");

    // Once the job is no longer open, only the involved people can read it.
    await db.job.update({
      where: { id: jobId },
      data: { status: "CONFIRMED" },
    });
    await get(`jobs/${jobId}`, stranger).expect(404);
    await get(`jobs/${jobId}`, customer).expect(200);
  });

  it("gives a bounded matching bonus for a relevant certificate", async () => {
    const matching = app.get(MatchingService);
    const job = {
      id: randomUUID(),
      poster_user_id: customer.id,
      location_id: areaIds[0]!,
      starts_at: null,
      ends_at: null,
      experience_min_years: null,
      payment_model: "FIXED" as const,
      job_type: "ONE_TIME" as const,
      budget_max_poisha: null,
      skills: [{ skill_id: cleaningSkillId }],
    };
    const score = async () =>
      (await matching.scoreJobsForWorker(worker.id, [job]))[0]!.match;
    const certified = await score();
    await db.trainingCertificate.updateMany({
      where: { user_id: worker.id },
      data: { revoked_at: new Date() },
    });
    const uncertified = await score();
    await db.trainingCertificate.updateMany({
      where: { user_id: worker.id },
      data: { revoked_at: null },
    });
    // Worker already has the skill (signal 1), so the bonus is capped away.
    expect(certified.components.skill).toBe(uncertified.components.skill);

    await db.userSkill.deleteMany({ where: { user_id: worker.id } });
    const withoutSkillCertified = await score();
    await db.trainingCertificate.updateMany({
      where: { user_id: worker.id },
      data: { revoked_at: new Date() },
    });
    const withoutSkill = await score();
    await db.trainingCertificate.updateMany({
      where: { user_id: worker.id },
      data: { revoked_at: null },
    });
    const gain =
      withoutSkillCertified.components.skill - withoutSkill.components.skill;
    expect(gain).toBeGreaterThan(0);
    // At most +0.1 on the skill signal: never more than 10 points in total.
    expect(gain).toBeLessThanOrEqual(10);
    expect(
      withoutSkillCertified.score - withoutSkill.score,
    ).toBeLessThanOrEqual(10);
  });

  it("reloads content idempotently and bumps the version on change", async () => {
    const again = await loadTrainingContent(db, content, { publish: true });
    expect(again.unchanged).toEqual(courseSlugs.slice(0, 3));

    const changed = structuredClone(content);
    changed.courses[0]!.questions[0]!.promptEn = "A reworded question?";
    changed.courses[0]!.lessons[0]!.titleEn = "Tools you need";
    const before = await db.trainingCourse.findUniqueOrThrow({
      where: { slug: courseSlugs[0] },
      include: { lessons: { orderBy: { sort_order: "asc" } } },
    });
    const result = await loadTrainingContent(db, changed, { publish: true });
    expect(result.versionBumped).toEqual([courseSlugs[0]]);
    expect(result.unchanged).toEqual(courseSlugs.slice(1, 3));
    const after = await db.trainingCourse.findUniqueOrThrow({
      where: { slug: courseSlugs[0] },
      include: {
        lessons: { orderBy: { sort_order: "asc" } },
        questions: { where: { is_active: true } },
      },
    });
    expect(after.version).toBe(before.version + 1);
    // Lessons are updated in place, so private progress is kept.
    expect(after.lessons.map((lesson) => lesson.id)).toEqual(
      before.lessons.map((lesson) => lesson.id),
    );
    expect(after.lessons[0]!.title_en).toBe("Tools you need");
    expect(after.questions).toHaveLength(5);
    // The old certificate was for the previous version: the test is open again.
    const id = after.id;
    const summary = (await courses(worker, "all")).find(
      (item) => item.id === id,
    )!;
    expect(summary.certificate).toBeNull();
    await post(`training/courses/${id}/attempts`, worker).expect(201);
    expect(
      (await get("me/certificates", worker).expect(200)).body.data.items,
    ).toHaveLength(1);
  });
});
