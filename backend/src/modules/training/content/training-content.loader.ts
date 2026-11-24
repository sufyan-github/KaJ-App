import { Prisma, PrismaClient, TrainingStepKind } from "@prisma/client";
import { z } from "zod";

const text = z.string().trim().min(1);

/**
 * A stored step picture: `training/steps/<uuid>-<width>x<height>.webp`, as
 * returned by the admin upload (the size is part of the key).
 */
export const STEP_IMAGE_KEY =
  /^training\/steps\/[0-9a-f-]{36}-(\d{1,4})x(\d{1,4})\.webp$/u;

export function stepImageSize(key: string): { width: number; height: number } {
  const match = STEP_IMAGE_KEY.exec(key);
  if (!match) throw new Error(`Not a step image key: ${key}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

const optionalText = z
  .string()
  .trim()
  .max(300)
  .nullish()
  .transform((value) => value || null);

const stepSchema = z.object({
  kind: z.nativeEnum(TrainingStepKind),
  en: text.max(1000),
  bn: text.max(1000),
  image: z.string().regex(STEP_IMAGE_KEY).nullish().default(null),
  altEn: optionalText,
  altBn: optionalText,
});

const optionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/),
  en: text,
  bn: text,
});

const questionSchema = z
  .object({
    promptEn: text,
    promptBn: text,
    options: z.array(optionSchema).min(2).max(6),
    correctOptionId: z.string(),
    explanationEn: text,
    explanationBn: text,
    /** 1-based lesson number: a checkpoint question for that lesson. */
    lesson: z.number().int().min(1).nullish().default(null),
  })
  .refine(
    (question) =>
      new Set(question.options.map((option) => option.id)).size ===
      question.options.length,
    { message: "Option ids must be unique within a question." },
  )
  .refine(
    (question) =>
      question.options.some((option) => option.id === question.correctOptionId),
    { message: "correctOptionId must be one of the options." },
  );

const lessonSchema = z.object({
  titleEn: text,
  titleBn: text,
  summaryEn: text,
  summaryBn: text,
  youtubeVideoId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{6,20}$/)
    .nullable()
    .default(null),
  durationS: z.number().int().nonnegative().nullable().default(null),
  isSafety: z.boolean().default(false),
  /** Cards on the lesson page; derived from the summary lines when absent. */
  steps: z.array(stepSchema).min(1).max(40).optional(),
});

/** One course document: the seed file's format and the admin editor's. */
export const courseSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    skillSlug: z.string().min(1).nullable(),
    titleEn: text,
    titleBn: text,
    summaryEn: text,
    summaryBn: text,
    minutes: z.number().int().nonnegative(),
    estDataMb: z.number().int().nonnegative(),
    passMarkPct: z.number().int().min(1).max(100).default(70),
    questionCount: z.number().int().min(1).default(10),
    isSafetyCritical: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    lessons: z.array(lessonSchema),
    questions: z.array(questionSchema).min(1),
  })
  .superRefine((course, context) => {
    course.questions.forEach((question, index) => {
      if (question.lesson !== null && question.lesson > course.lessons.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "lesson"],
          message: `Lesson ${question.lesson} does not exist (the course has ${course.lessons.length}).`,
        });
    });
  });

export const trainingContentSchema = z
  .object({ courses: z.array(courseSchema) })
  .refine(
    (content) =>
      new Set(content.courses.map((course) => course.slug)).size ===
      content.courses.length,
    { message: "Course slugs must be unique." },
  );

export type TrainingContent = z.infer<typeof trainingContentSchema>;
export type CourseContent = TrainingContent["courses"][number];

export interface TrainingContentResult {
  created: string[];
  updated: string[];
  versionBumped: string[];
  unchanged: string[];
}

/**
 * Idempotent: upserts courses by slug. Lessons and questions are rewritten
 * only when they changed, and then the course version goes up so earlier
 * certificates stop counting for the new content. Replaced questions are
 * deactivated rather than deleted, which keeps old attempts readable.
 * Courses are published only when `publish` is set; otherwise new courses
 * stay hidden and existing ones keep their current visibility.
 */
export async function loadTrainingContent(
  prisma: PrismaClient,
  raw: unknown,
  options: { publish: boolean },
): Promise<TrainingContentResult> {
  const content = trainingContentSchema.parse(raw);
  const skillSlugs = [
    ...new Set(
      content.courses.flatMap((course) =>
        course.skillSlug ? [course.skillSlug] : [],
      ),
    ),
  ];
  const skills = await prisma.skill.findMany({
    where: { slug: { in: skillSlugs } },
    select: { id: true, slug: true },
  });
  const skillIdBySlug = new Map(skills.map((skill) => [skill.slug, skill.id]));
  const unknown = skillSlugs.filter((slug) => !skillIdBySlug.has(slug));
  if (unknown.length > 0) {
    throw new Error(`Unknown skill slugs in training content: ${unknown}`);
  }

  // A locked-order (safety-critical) course is published only with two
  // checkpoint questions for every lesson.
  if (options.publish)
    for (const course of content.courses) {
      if (!course.isSafetyCritical) continue;
      const missing = lessonsWithoutTwoCheckpoints(
        course.lessons.length,
        course.questions.map((question) => question.lesson),
      );
      if (missing.length > 0)
        throw new Error(
          `${course.slug}: a safety-critical course needs exactly 2 checkpoint questions per lesson to be published (lessons ${missing.join(", ")}).`,
        );
    }

  const result: TrainingContentResult = {
    created: [],
    updated: [],
    versionBumped: [],
    unchanged: [],
  };
  for (const course of content.courses) {
    const outcome = await prisma.$transaction((transaction) =>
      upsertCourse(
        transaction,
        course,
        course.skillSlug ? skillIdBySlug.get(course.skillSlug)! : null,
        options.publish,
      ),
    );
    result[outcome].push(course.slug);
  }
  return result;
}

/** A lesson step after authoring or derivation (what is stored). */
export interface ResolvedStep {
  kind: TrainingStepKind;
  en: string;
  bn: string;
  image: string | null;
  altEn: string | null;
  altBn: string | null;
}

type LessonContent = CourseContent["lessons"][number];

/** The summary-line prefixes the authored courses use, per kind. */
export const STEP_PREFIXES: ReadonlyArray<{
  kind: TrainingStepKind;
  en: RegExp;
  bn: RegExp;
}> = [
  {
    kind: TrainingStepKind.LEARN,
    en: /^You will learn:\s*/u,
    bn: /^আপনি শিখবেন:\s*/u,
  },
  {
    kind: TrainingStepKind.STEP,
    en: /^Step\s*\d+\s*:\s*/u,
    bn: /^ধাপ\s*[০-৯0-9]+\s*:\s*/u,
  },
  { kind: TrainingStepKind.HAZARD, en: /^Hazard:\s*/u, bn: /^ঝুঁকি:\s*/u },
  {
    kind: TrainingStepKind.REMEMBER,
    en: /^Remember:\s*/u,
    bn: /^মনে রাখুন:\s*/u,
  },
];

const summaryLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

/** The kind a summary line's prefix names, or null when it has none. */
export function stepKindOf(
  line: string,
  language: "en" | "bn",
): TrainingStepKind | null {
  return (
    STEP_PREFIXES.find((prefix) => prefix[language].test(line.trim()))?.kind ??
    null
  );
}

function stripPrefix(line: string, language: "en" | "bn") {
  const prefix = STEP_PREFIXES.find((item) => item[language].test(line));
  const stripped = prefix ? line.replace(prefix[language], "").trim() : line;
  return stripped || line;
}

/**
 * Steps from the summary lines: the English prefix names the kind (no
 * prefix: STEP) and both prefixes are removed. When the two languages have a
 * different number of lines, the whole summary is one STEP.
 */
export function deriveSteps(
  summaryEn: string,
  summaryBn: string,
): ResolvedStep[] {
  const en = summaryLines(summaryEn);
  const bn = summaryLines(summaryBn);
  const step = (kind: TrainingStepKind, textEn: string, textBn: string) => ({
    kind,
    en: textEn,
    bn: textBn,
    image: null,
    altEn: null,
    altBn: null,
  });
  if (en.length === 0 || en.length !== bn.length)
    return [step(TrainingStepKind.STEP, summaryEn.trim(), summaryBn.trim())];
  return en.map((line, index) =>
    step(
      stepKindOf(line, "en") ?? TrainingStepKind.STEP,
      stripPrefix(line, "en"),
      stripPrefix(bn[index]!, "bn"),
    ),
  );
}

/** The lesson's authored steps, or the ones derived from its summary. */
export function lessonSteps(lesson: LessonContent): ResolvedStep[] {
  if (!lesson.steps) return deriveSteps(lesson.summaryEn, lesson.summaryBn);
  return lesson.steps.map((step) => ({
    kind: step.kind,
    en: step.en,
    bn: step.bn,
    image: step.image ?? null,
    altEn: step.altEn ?? null,
    altBn: step.altBn ?? null,
  }));
}

/** Stored step rows as ResolvedStep (derived when none are stored). */
export function storedSteps(lesson: {
  summary_en: string;
  summary_bn: string;
  steps: ReadonlyArray<{
    kind: TrainingStepKind;
    text_en: string;
    text_bn: string;
    image_key: string | null;
    image_alt_en: string | null;
    image_alt_bn: string | null;
  }>;
}): ResolvedStep[] {
  if (lesson.steps.length === 0)
    return deriveSteps(lesson.summary_en, lesson.summary_bn);
  return lesson.steps.map((step) => ({
    kind: step.kind,
    en: step.text_en,
    bn: step.text_bn,
    image: step.image_key,
    altEn: step.image_alt_en,
    altBn: step.image_alt_bn,
  }));
}

/**
 * A locked-order (safety-critical) course needs exactly two checkpoint
 * questions per lesson. Returns the lesson numbers that do not.
 */
export function lessonsWithoutTwoCheckpoints(
  lessonCount: number,
  questionLessons: ReadonlyArray<number | null>,
): number[] {
  const counts = new Map<number, number>();
  for (const lesson of questionLessons)
    if (lesson !== null) counts.set(lesson, (counts.get(lesson) ?? 0) + 1);
  return Array.from({ length: lessonCount }, (_, index) => index + 1).filter(
    (lesson) => counts.get(lesson) !== 2,
  );
}

const stepsKey = (steps: readonly ResolvedStep[]) =>
  steps.map((step) => [
    step.kind,
    step.en,
    step.bn,
    step.image,
    step.altEn,
    step.altBn,
  ]);

/**
 * Creates or updates one course. Content changes (lessons, steps, question
 * text) bump the course version; a lesson whose text, steps or checkpoint
 * questions changed also gets a new revision, which resets checkpoint passes
 * for that lesson only. Linking existing questions to lessons, or storing
 * steps that were only derived so far, changes no version. `publish` only
 * ever turns publishing on.
 */
export async function upsertCourse(
  transaction: Prisma.TransactionClient,
  course: CourseContent,
  skillId: string | null,
  publish: boolean,
): Promise<keyof TrainingContentResult> {
  const fields = {
    skill_id: skillId,
    title_en: course.titleEn,
    title_bn: course.titleBn,
    summary_en: course.summaryEn,
    summary_bn: course.summaryBn,
    minutes: course.minutes,
    est_data_mb: course.estDataMb,
    pass_mark_pct: course.passMarkPct,
    question_count: course.questionCount,
    is_safety_critical: course.isSafetyCritical,
    sort_order: course.sortOrder,
  };
  const existing = await transaction.trainingCourse.findUnique({
    where: { slug: course.slug },
    include: {
      lessons: {
        orderBy: { sort_order: "asc" },
        include: { steps: { orderBy: { sort_order: "asc" } } },
      },
      questions: { where: { is_active: true } },
    },
  });
  const contentSteps = course.lessons.map(lessonSteps);

  if (!existing) {
    const created = await transaction.trainingCourse.create({
      data: { slug: course.slug, ...fields, is_published: publish },
    });
    const lessonIds = await writeLessons(
      transaction,
      created.id,
      course,
      contentSteps,
      null,
    );
    await writeQuestions(transaction, created.id, course.questions, lessonIds);
    return "created";
  }

  const storedLessonKeys = existing.lessons.map((lesson) =>
    JSON.stringify([...storedLessonKey(lesson), stepsKey(storedSteps(lesson))]),
  );
  const contentLessonKeys = course.lessons.map((lesson, index) =>
    JSON.stringify([
      ...contentLessonKey(lesson),
      stepsKey(contentSteps[index]!),
    ]),
  );
  const lessonsChanged =
    JSON.stringify(storedLessonKeys) !== JSON.stringify(contentLessonKeys);
  const questionsChanged =
    JSON.stringify(existing.questions.map(storedQuestionKey).sort()) !==
    JSON.stringify(course.questions.map(contentQuestionKey).sort());

  // Checkpoint questions per lesson position, before and after.
  const lessonNumberById = new Map(
    existing.lessons.map((lesson, index) => [lesson.id, index + 1]),
  );
  const storedCheckpoints = (lesson: number) =>
    JSON.stringify(
      existing.questions
        .filter(
          (question) =>
            question.lesson_id &&
            lessonNumberById.get(question.lesson_id) === lesson,
        )
        .map(storedQuestionKey)
        .sort(),
    );
  const contentCheckpoints = (lesson: number) =>
    JSON.stringify(
      course.questions
        .filter((question) => question.lesson === lesson)
        .map(contentQuestionKey)
        .sort(),
    );
  const revised = new Set<number>();
  existing.lessons.forEach((_, index) => {
    if (index >= course.lessons.length) return;
    if (
      storedLessonKeys[index] !== contentLessonKeys[index] ||
      storedCheckpoints(index + 1) !== contentCheckpoints(index + 1)
    )
      revised.add(index);
  });
  const mappingChanged =
    !questionsChanged &&
    course.questions.some((question, index) => {
      const key = contentQuestionKey(question);
      const stored = existing.questions.find(
        (item) => storedQuestionKey(item) === key,
      );
      const storedLesson = stored?.lesson_id
        ? (lessonNumberById.get(stored.lesson_id) ?? null)
        : null;
      return (
        storedLesson !== question.lesson || stored?.sort_order !== index + 1
      );
    });
  const stepsMissing = existing.lessons.some(
    (lesson) => lesson.steps.length === 0,
  );
  const metadataChanged =
    Object.entries(fields).some(
      ([key, value]) => existing[key as keyof typeof fields] !== value,
    ) ||
    (publish && !existing.is_published);

  let lessonIds = existing.lessons.map((lesson) => lesson.id);
  if (lessonsChanged || stepsMissing || revised.size > 0) {
    lessonIds = await writeLessons(
      transaction,
      existing.id,
      course,
      contentSteps,
      {
        lessons: existing.lessons,
        revised,
      },
    );
  }
  if (questionsChanged) {
    await transaction.trainingQuestion.updateMany({
      where: { course_id: existing.id, is_active: true },
      data: { is_active: false },
    });
    await writeQuestions(transaction, existing.id, course.questions, lessonIds);
  } else if (mappingChanged) {
    // Same questions, new lesson links or order: updated in place.
    for (const [index, question] of course.questions.entries()) {
      const key = contentQuestionKey(question);
      const stored = existing.questions.find(
        (item) => storedQuestionKey(item) === key,
      );
      const lessonId = question.lesson ? lessonIds[question.lesson - 1]! : null;
      if (
        stored &&
        (stored.lesson_id !== lessonId || stored.sort_order !== index + 1)
      )
        await transaction.trainingQuestion.update({
          where: { id: stored.id },
          data: { lesson_id: lessonId, sort_order: index + 1 },
        });
    }
  }
  const bump = lessonsChanged || questionsChanged;
  if (bump || metadataChanged) {
    await transaction.trainingCourse.update({
      where: { id: existing.id },
      data: {
        ...fields,
        ...(publish ? { is_published: true } : {}),
        ...(bump ? { version: { increment: 1 } } : {}),
      },
    });
  }
  if (bump) return "versionBumped";
  return metadataChanged || mappingChanged || stepsMissing
    ? "updated"
    : "unchanged";
}

/**
 * Updates lessons in place by position so private progress survives, and
 * rewrites a lesson's steps when they differ from what is stored.
 */
async function writeLessons(
  transaction: Prisma.TransactionClient,
  courseId: string,
  course: CourseContent,
  contentSteps: ReadonlyArray<ResolvedStep[]>,
  existing: {
    lessons: ReadonlyArray<{
      id: string;
      summary_en: string;
      summary_bn: string;
      steps: Parameters<typeof storedSteps>[0]["steps"];
    }>;
    revised: ReadonlySet<number>;
  } | null,
): Promise<string[]> {
  const ids: string[] = [];
  for (const [index, lesson] of course.lessons.entries()) {
    const data = {
      title_en: lesson.titleEn,
      title_bn: lesson.titleBn,
      summary_en: lesson.summaryEn,
      summary_bn: lesson.summaryBn,
      youtube_video_id: lesson.youtubeVideoId,
      duration_s: lesson.durationS,
      is_safety: lesson.isSafety,
    };
    const saved = await transaction.trainingLesson.upsert({
      where: {
        course_id_sort_order: { course_id: courseId, sort_order: index + 1 },
      },
      create: { course_id: courseId, sort_order: index + 1, ...data },
      update: {
        ...data,
        ...(existing?.revised.has(index) ? { revision: { increment: 1 } } : {}),
      },
      select: { id: true },
    });
    ids.push(saved.id);
    const before = existing?.lessons[index];
    const steps = contentSteps[index]!;
    const same =
      before !== undefined &&
      before.steps.length > 0 &&
      JSON.stringify(stepsKey(storedSteps(before))) ===
        JSON.stringify(stepsKey(steps));
    if (!same) {
      await transaction.trainingLessonStep.deleteMany({
        where: { lesson_id: saved.id },
      });
      await transaction.trainingLessonStep.createMany({
        data: steps.map((step, position) => ({
          lesson_id: saved.id,
          sort_order: position + 1,
          kind: step.kind,
          text_en: step.en,
          text_bn: step.bn,
          image_key: step.image,
          image_width: step.image ? stepImageSize(step.image).width : null,
          image_height: step.image ? stepImageSize(step.image).height : null,
          image_alt_en: step.altEn,
          image_alt_bn: step.altBn,
        })),
      });
    }
  }
  if (existing && existing.lessons.length > course.lessons.length) {
    await transaction.trainingLesson.deleteMany({
      where: { course_id: courseId, sort_order: { gt: course.lessons.length } },
    });
  }
  return ids;
}

async function writeQuestions(
  transaction: Prisma.TransactionClient,
  courseId: string,
  questions: CourseContent["questions"],
  lessonIds: readonly string[],
) {
  await transaction.trainingQuestion.createMany({
    data: questions.map((question, index) => ({
      course_id: courseId,
      sort_order: index + 1,
      lesson_id: question.lesson ? lessonIds[question.lesson - 1]! : null,
      prompt_en: question.promptEn,
      prompt_bn: question.promptBn,
      options_json: question.options,
      correct_option_id: question.correctOptionId,
      explanation_en: question.explanationEn,
      explanation_bn: question.explanationBn,
    })),
  });
}

function contentLessonKey(lesson: CourseContent["lessons"][number]) {
  return [
    lesson.titleEn,
    lesson.titleBn,
    lesson.summaryEn,
    lesson.summaryBn,
    lesson.youtubeVideoId,
    lesson.durationS,
    lesson.isSafety,
  ];
}

function storedLessonKey(lesson: {
  title_en: string;
  title_bn: string;
  summary_en: string;
  summary_bn: string;
  youtube_video_id: string | null;
  duration_s: number | null;
  is_safety: boolean;
}) {
  return [
    lesson.title_en,
    lesson.title_bn,
    lesson.summary_en,
    lesson.summary_bn,
    lesson.youtube_video_id,
    lesson.duration_s,
    lesson.is_safety,
  ];
}

/** Question content; the lesson link is compared separately. */
function contentQuestionKey(question: CourseContent["questions"][number]) {
  return JSON.stringify([
    question.promptEn,
    question.promptBn,
    question.options.map((option) => [option.id, option.en, option.bn]),
    question.correctOptionId,
    question.explanationEn,
    question.explanationBn,
  ]);
}

function storedQuestionKey(question: {
  prompt_en: string;
  prompt_bn: string;
  options_json: Prisma.JsonValue;
  correct_option_id: string;
  explanation_en: string;
  explanation_bn: string;
}) {
  const options = Array.isArray(question.options_json)
    ? question.options_json.map((option) => {
        const item = (option ?? {}) as Record<string, unknown>;
        return [item.id, item.en, item.bn];
      })
    : [];
  return JSON.stringify([
    question.prompt_en,
    question.prompt_bn,
    options,
    question.correct_option_id,
    question.explanation_en,
    question.explanation_bn,
  ]);
}
