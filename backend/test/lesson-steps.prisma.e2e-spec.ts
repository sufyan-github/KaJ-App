import { randomUUID } from "node:crypto";
import { AdminRole, RoleMode } from "@prisma/client";
import sharp from "sharp";

import { STORAGE_PORT } from "../src/infra/storage/storage.port";
import {
  deriveSteps,
  loadTrainingContent,
  type CourseContent,
} from "../src/modules/training/content/training-content.loader";
import { TrainingAdminService } from "../src/modules/training/training-admin.service";
import { TrainingStepImagesService } from "../src/modules/training/training-step-images.service";
import { MemoryStorage } from "./support/memory-storage";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

type Course = Omit<CourseContent, "questions" | "lessons"> & {
  lessons: Array<Record<string, unknown>>;
  questions: Array<Record<string, unknown>>;
};

const lesson = (number: number, hazard = false) => ({
  titleEn: `Lesson ${number}`,
  titleBn: `পাঠ ${number}`,
  summaryEn: [
    `You will learn: thing ${number}.`,
    "Step 1: Switch off the main switch.",
    ...(hazard ? ["Hazard: a live wire can kill; never touch it."] : []),
    "Remember: safety first.",
  ].join("\n"),
  summaryBn: [
    `আপনি শিখবেন: বিষয় ${number}।`,
    "ধাপ ১: মেইন সুইচ বন্ধ করুন।",
    ...(hazard ? ["ঝুঁকি: চালু তারে মৃত্যু হতে পারে; কখনো ছোঁবেন না।"] : []),
    "মনে রাখুন: নিরাপত্তা আগে।",
  ].join("\n"),
  youtubeVideoId: null,
  durationS: 120,
  isSafety: hazard,
});

const question = (
  number: number,
  correct: string,
  lessonNumber: number | null,
) => ({
  promptEn: `Question ${number}?`,
  promptBn: `প্রশ্ন ${number}?`,
  options: ["a", "b", "c", "d"].map((id) => ({
    id,
    en: `Option ${id}`,
    bn: `বিকল্প ${id}`,
  })),
  correctOptionId: correct,
  explanationEn: `Because ${number}.`,
  explanationBn: `কারণ ${number}।`,
  lesson: lessonNumber,
});

/** Two lessons, two checkpoint questions each, plus two more for the test. */
const course = (slug: string, isSafetyCritical: boolean): Course => ({
  slug,
  skillSlug: null,
  titleEn: "Steps test",
  titleBn: "ধাপ পরীক্ষা",
  summaryEn: "A course for the lesson steps test.",
  summaryBn: "পাঠের ধাপ পরীক্ষার কোর্স।",
  minutes: 10,
  estDataMb: 1,
  passMarkPct: 70,
  questionCount: 4,
  isSafetyCritical,
  sortOrder: 950,
  lessons: [lesson(1, true), lesson(2)],
  questions: [
    question(1, "b", 1),
    question(2, "c", 1),
    question(3, "a", 2),
    question(4, "d", 2),
    question(5, "b", null),
    question(6, "a", null),
  ],
});

/** R8: lesson steps, pictures and checkpoints. */
databaseDescribe("lesson steps and checkpoints (real HTTP)", () => {
  let api: HttpHarness;
  const storage = new MemoryStorage();
  let tag: string;

  const load = (content: Course, publish = true) =>
    loadTrainingContent(api.db as never, { courses: [content] }, { publish });
  const courseId = async (slug: string) =>
    (await api.db.trainingCourse.findUniqueOrThrow({ where: { slug } })).id;
  const detail = async (as: Actor, id: string) =>
    (await api.get(`training/courses/${id}`, as).expect(200)).body.data;
  const answer = (
    as: Actor,
    lessonId: string,
    answers: Array<[string, string]>,
  ) =>
    api.post(`training/lessons/${lessonId}/checkpoint`, as, {
      answers: answers.map(([questionId, optionId]) => ({
        questionId,
        optionId,
      })),
    });
  /** The checkpoint questions in order with their right and a wrong option. */
  const keys = async (lessonId: string) =>
    (
      await api.db.trainingQuestion.findMany({
        where: { lesson_id: lessonId, is_active: true },
        orderBy: [{ sort_order: "asc" }, { id: "asc" }],
      })
    ).map((row) => ({
      id: row.id,
      right: row.correct_option_id,
      wrong: row.correct_option_id === "a" ? "b" : "a",
    }));
  const pass = async (as: Actor, lessonId: string, status: number) => {
    const qs = await keys(lessonId);
    return answer(
      as,
      lessonId,
      qs.map((q) => [q.id, q.right] as [string, string]),
    ).expect(status);
  };

  beforeAll(async () => {
    api = await HttpHarness.start((builder) =>
      builder.overrideProvider(STORAGE_PORT).useValue(storage),
    );
  });

  beforeEach(() => {
    tag = randomUUID().slice(0, 8);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("derives steps from the summary lines and keeps the summary for old apps", async () => {
    expect(
      deriveSteps(
        "You will learn: A.\nStep 1: B.\nHazard: C.\nRemember: D.\nE.",
        "আপনি শিখবেন: ক।\nধাপ ১: খ।\nঝুঁকি: গ।\nমনে রাখুন: ঘ।\nঙ।",
      ).map((step) => [step.kind, step.en, step.bn]),
    ).toEqual([
      ["LEARN", "A.", "ক।"],
      ["STEP", "B.", "খ।"],
      ["HAZARD", "C.", "গ।"],
      ["REMEMBER", "D.", "ঘ।"],
      ["STEP", "E.", "ঙ।"],
    ]);
    // Different line counts: the whole summary is one step.
    expect(deriveSteps("One.\nTwo.", "এক।").map((step) => step.kind)).toEqual([
      "STEP",
    ]);

    const slug = `steps-${tag}`;
    await load(course(slug, false));
    const learner = await api.actor([RoleMode.WORKER]);
    const data = await detail(learner, await courseId(slug));
    expect(data.lessons[0].summaryEn).toContain("Step 1: Switch off");
    expect(
      data.lessons[0].steps.map(
        (step: { kind: string; textEn: string; image: unknown }) => [
          step.kind,
          step.textEn,
          step.image,
        ],
      ),
    ).toEqual([
      ["LEARN", "thing 1.", null],
      ["STEP", "Switch off the main switch.", null],
      ["HAZARD", "a live wire can kill; never touch it.", null],
      ["REMEMBER", "safety first.", null],
    ]);
    expect(data.lessons[0].steps[1].textBn).toBe("মেইন সুইচ বন্ধ করুন।");

    // Lessons from before this change (no stored steps) are derived on read.
    await api.db.trainingLessonStep.deleteMany({
      where: { lesson: { course: { slug } } },
    });
    const again = await detail(learner, await courseId(slug));
    expect(again.lessons[0].steps).toHaveLength(4);
    expect(again.lessons[0].steps[0].id).toEqual(expect.any(String));
    // Reloading stores them without a new version.
    const reload = await load(course(slug, false));
    expect(reload.updated).toEqual([slug]);
    expect(
      (await api.db.trainingCourse.findUniqueOrThrow({ where: { slug } }))
        .version,
    ).toBe(1);
  });

  it("keeps an open course open: practice checkpoints and the test shortcut", async () => {
    const slug = `open-${tag}`;
    await load(course(slug, false));
    const id = await courseId(slug);
    const learner = await api.actor([RoleMode.WORKER]);
    const data = await detail(learner, id);
    expect(data).toMatchObject({
      lockedOrder: false,
      testLocked: false,
      checkpointsPassed: 0,
      checkpointLessons: 2,
    });
    expect(data.lessons.map((item: { state: string }) => item.state)).toEqual([
      "OPEN",
      "OPEN",
    ]);
    expect(data.lessons[1].checkpoint).toEqual({
      questionCount: 2,
      passed: false,
    });
    // The second lesson's checkpoint works before the first.
    expect(
      (await pass(learner, data.lessons[1].id, 201)).body.data,
    ).toMatchObject({
      passed: true,
      lessonState: "DONE",
      nextLessonId: null,
    });
    await api.post(`training/courses/${id}/attempts`, learner).expect(201);
  });

  it("locks lessons and the test in order in a safety-critical course", async () => {
    const slug = `locked-${tag}`;
    await load(course(slug, true));
    const id = await courseId(slug);
    const learner = await api.actor([RoleMode.WORKER]);
    const before = await detail(learner, id);
    expect(before).toMatchObject({ lockedOrder: true, testLocked: true });
    expect(before.lessons.map((item: { state: string }) => item.state)).toEqual(
      ["OPEN", "LOCKED"],
    );
    const [first, second] = before.lessons.map(
      (item: { id: string }) => item.id,
    );
    const locked = await api
      .get(`training/lessons/${second}/checkpoint`, learner)
      .expect(409);
    expect(locked.body.error.code).toBe("LESSON_LOCKED");
    await pass(learner, second, 409);
    const testLocked = await api
      .post(`training/courses/${id}/attempts`, learner)
      .expect(409);
    expect(testLocked.body.error.code).toBe("TEST_LOCKED");

    // Wrong answers: explanation, no correct option; unlimited tries.
    const qs = await keys(first);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const wrong = await answer(learner, first, [
        [qs[0]!.id, qs[0]!.right],
        [qs[1]!.id, qs[1]!.wrong],
      ]).expect(201);
      expect(wrong.body.data).toMatchObject({
        passed: false,
        lessonState: "OPEN",
        nextLessonState: "LOCKED",
        testLocked: true,
        results: [
          { questionId: qs[0]!.id, correct: true },
          {
            questionId: qs[1]!.id,
            correct: false,
            explanationEn: "Because 2.",
            explanationBn: "কারণ 2।",
          },
        ],
      });
      expect(JSON.stringify(wrong.body)).not.toMatch(
        /correctOption|correct_option/u,
      );
    }
    const shown = await api
      .get(`training/lessons/${first}/checkpoint`, learner)
      .expect(200);
    expect(shown.body.data.questions).toHaveLength(2);
    expect(JSON.stringify(shown.body)).not.toMatch(
      /correctOption|correct_option/u,
    );
    expect(JSON.stringify(await detail(learner, id))).not.toMatch(
      /correctOption|correct_option/u,
    );

    const passed = await pass(learner, first, 201);
    expect(passed.body.data).toMatchObject({
      passed: true,
      lessonState: "DONE",
      nextLessonId: second,
      nextLessonState: "OPEN",
      testLocked: true,
    });
    const row = await api.db.trainingLessonCheckpoint.findUniqueOrThrow({
      where: { user_id_lesson_id: { user_id: learner.id, lesson_id: first } },
    });
    expect(row.attempts).toBe(4);
    // Already passed: a wrong try changes nothing.
    const after = await answer(learner, first, [
      [qs[0]!.id, qs[0]!.wrong],
      [qs[1]!.id, qs[1]!.wrong],
    ]).expect(201);
    expect(after.body.data).toMatchObject({
      passed: false,
      lessonState: "DONE",
    });

    await pass(learner, second, 201);
    const done = await detail(learner, id);
    expect(done).toMatchObject({ testLocked: false, checkpointsPassed: 2 });
    await api.post(`training/courses/${id}/attempts`, learner).expect(201);
    // Checkpoints never count toward the certificate.
    expect(
      await api.db.trainingCertificate.count({
        where: { user_id: learner.id, course_id: id },
      }),
    ).toBe(0);
  });

  it("refuses invalid checkpoint answers", async () => {
    const slug = `invalid-${tag}`;
    await load(course(slug, false));
    const learner = await api.actor([RoleMode.WORKER]);
    const first = (await detail(learner, await courseId(slug))).lessons[0].id;
    const qs = await keys(first);
    for (const answers of [
      [[qs[0]!.id, qs[0]!.right]],
      [
        [qs[0]!.id, qs[0]!.right],
        [qs[0]!.id, qs[0]!.right],
      ],
      [
        [qs[0]!.id, qs[0]!.right],
        [qs[1]!.id, "z"],
      ],
      [
        [qs[0]!.id, qs[0]!.right],
        [randomUUID(), "a"],
      ],
    ] as Array<Array<[string, string]>>) {
      const refused = await answer(learner, first, answers).expect(400);
      expect(refused.body.error.code).toBe("CHECKPOINT_ANSWERS_INVALID");
    }
    expect(
      await api.db.trainingLessonCheckpoint.count({
        where: { user_id: learner.id },
      }),
    ).toBe(0);
  });

  it("keeps a pass across versions unless that lesson changed", async () => {
    const slug = `revision-${tag}`;
    const content = course(slug, true);
    await load(content);
    const id = await courseId(slug);
    const learner = await api.actor([RoleMode.WORKER]);
    const [first, second] = (await detail(learner, id)).lessons.map(
      (item: { id: string }) => item.id,
    );
    await pass(learner, first, 201);
    await pass(learner, second, 201);

    // A change to lesson 2 only: lesson 1 stays passed, lesson 2 opens again.
    const changed = structuredClone(content);
    changed.lessons[1]!.titleEn = "Lesson 2, revised";
    expect((await load(changed)).versionBumped).toEqual([slug]);
    const after = await detail(learner, id);
    expect(after.lessons.map((item: { state: string }) => item.state)).toEqual([
      "DONE",
      "OPEN",
    ]);
    expect(after.testLocked).toBe(true);

    // A question moving to another lesson is not a new version.
    const moved = structuredClone(changed);
    moved.questions[4]!.lesson = null;
    expect((await load(moved)).unchanged).toEqual([slug]);
  });

  describe("admin", () => {
    let admin: {
      userId: string;
      email: string;
      role: AdminRole;
      sessionId: string;
    };
    let courses: TrainingAdminService;
    let images: TrainingStepImagesService;
    const context = { ip: "127.0.0.1", ua: "lesson-steps-test" };

    const picture = (width: number, height: number) =>
      sharp({
        create: {
          width,
          height,
          channels: 3,
          background: { r: 200, g: 120, b: 40 },
        },
      })
        .png()
        .toBuffer();
    const upload = async (body: Buffer) => {
      const signed = await images.sign(admin.userId, {
        mime: "image/png",
        sizeBytes: body.byteLength,
      });
      storage.put(signed.key, body, "image/png");
      return images.complete(admin.userId, {
        key: signed.key,
        mime: "image/png",
        sizeBytes: body.byteLength,
      });
    };

    beforeAll(async () => {
      courses = api.app.get(TrainingAdminService);
      images = api.app.get(TrainingStepImagesService);
      admin = {
        userId: (await api.actor([RoleMode.CUSTOMER])).id,
        email: "lesson-steps@kaj.test",
        role: AdminRole.ADMIN,
        sessionId: randomUUID(),
      };
    });

    it("checks step pictures: type, size and dimensions", async () => {
      await expect(
        images.sign(admin.userId, { mime: "image/png", sizeBytes: 400_000 }),
      ).rejects.toMatchObject({
        descriptor: expect.objectContaining({ code: "UPLOAD_REQUEST_INVALID" }),
      });
      await expect(
        images.sign(admin.userId, {
          mime: "image/gif" as never,
          sizeBytes: 100,
        }),
      ).rejects.toMatchObject({
        descriptor: expect.objectContaining({ code: "UPLOAD_REQUEST_INVALID" }),
      });
      await expect(upload(await picture(1700, 400))).rejects.toMatchObject({
        descriptor: expect.objectContaining({
          code: "TRAINING_IMAGE_TOO_LARGE",
        }),
      });
      // A PNG sent as a JPEG.
      const body = await picture(40, 30);
      const signed = await images.sign(admin.userId, {
        mime: "image/jpeg",
        sizeBytes: body.byteLength,
      });
      storage.put(signed.key, body, "image/jpeg");
      await expect(
        images.complete(admin.userId, {
          key: signed.key,
          mime: "image/jpeg",
          sizeBytes: body.byteLength,
        }),
      ).rejects.toMatchObject({
        descriptor: expect.objectContaining({ code: "TRAINING_IMAGE_INVALID" }),
      });
      // Someone else's pending key.
      await expect(
        images.complete(randomUUID(), {
          key: signed.key,
          mime: "image/jpeg",
          sizeBytes: body.byteLength,
        }),
      ).rejects.toMatchObject({
        descriptor: expect.objectContaining({ code: "UPLOAD_REQUEST_INVALID" }),
      });
    });

    it("edits steps with pictures and lesson links, and deletes unused pictures", async () => {
      const slug = `admin-steps-${tag}`;
      const created = await courses.create(
        course(slug, false),
        "Lesson steps test course.",
        admin,
        context,
      );
      expect(created.document.lessons[0]!.steps).toHaveLength(4);
      expect(created.document.questions.map((item) => item.lesson)).toEqual([
        1,
        1,
        2,
        2,
        null,
        null,
      ]);
      const stored = await upload(await picture(800, 600));
      expect(stored).toMatchObject({ width: 800, height: 600 });
      expect(stored.imageKey).toMatch(/^training\/steps\/.+-800x600\.webp$/u);
      expect(storage.objects.has(stored.imageKey)).toBe(true);

      const withPicture = structuredClone(created.document) as Course;
      const steps = withPicture.lessons[0]!.steps as Array<
        Record<string, unknown>
      >;
      steps[1] = {
        ...steps[1],
        image: stored.imageKey,
        altEn: "A hand on the main switch",
        altBn: "মেইন সুইচে হাত",
      };
      const saved = await courses.update(
        created.id,
        withPicture,
        "Add a step picture.",
        admin,
        context,
      );
      expect(saved.outcome).toBe("versionBumped");
      expect(saved.document.lessons[0]!.steps[1]).toMatchObject({
        image: stored.imageKey,
        imagePreviewUrl: expect.any(String),
      });
      // A picture that was never uploaded is refused.
      const unknown = structuredClone(withPicture);
      (unknown.lessons[1]!.steps as Array<Record<string, unknown>>)[0]!.image =
        `training/steps/${randomUUID()}-10x10.webp`;
      await expect(
        courses.update(created.id, unknown, "Bad picture key.", admin, context),
      ).rejects.toMatchObject({
        descriptor: expect.objectContaining({ code: "TRAINING_IMAGE_INVALID" }),
      });

      await courses.setPublished(
        created.id,
        true,
        "Publish for the test.",
        admin,
        context,
      );
      const learner = await api.actor([RoleMode.WORKER]);
      const data = await detail(learner, created.id);
      expect(data.lessons[0].steps[1].image).toMatchObject({
        url: expect.any(String),
        cacheKey: stored.imageKey,
        width: 800,
        height: 600,
        altEn: "A hand on the main switch",
        altBn: "মেইন সুইচে হাত",
        expiresAt: expect.any(String),
      });

      // Removing the step's picture deletes it from storage.
      const without = structuredClone(withPicture);
      (without.lessons[0]!.steps as Array<Record<string, unknown>>)[1]!.image =
        null;
      await courses.update(
        created.id,
        without,
        "Remove the picture.",
        admin,
        context,
      );
      expect(storage.objects.has(stored.imageKey)).toBe(false);
    });

    it("publishes a safety-critical course only with two checkpoint questions per lesson", async () => {
      const slug = `admin-safety-${tag}`;
      const content = course(slug, true);
      content.questions[3]!.lesson = null;
      const created = await courses.create(
        content,
        "Safety course for the test.",
        admin,
        context,
      );
      await expect(
        courses.setPublished(
          created.id,
          true,
          "Publish for the test.",
          admin,
          context,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "COURSE_CHECKPOINTS_INCOMPLETE",
          details: [{ field: "lessons.1", rules: ["checkpoint_count"] }],
        }),
      });
      const fixed = course(slug, true);
      await courses.update(
        created.id,
        fixed,
        "Add the checkpoint.",
        admin,
        context,
      );
      await courses.setPublished(
        created.id,
        true,
        "Publish for the test.",
        admin,
        context,
      );
      // Once published, it can't be saved without them.
      await expect(
        courses.update(
          created.id,
          content,
          "Break the checkpoint.",
          admin,
          context,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: "COURSE_CHECKPOINTS_INCOMPLETE",
        }),
      });
      // The seed loader refuses to publish it either.
      await expect(load({ ...content, slug: `seed-${tag}` })).rejects.toThrow(
        /exactly 2 checkpoint questions per lesson/u,
      );
    });
  });
});
