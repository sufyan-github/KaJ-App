import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const text = z.string().trim().min(1);

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
});

/** One course document: the seed file's format and the admin editor's. */
export const courseSchema = z.object({
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

/**
 * Creates or updates one course. Content changes (lessons, questions) bump
 * the version; `publish` only ever turns publishing on.
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
      lessons: { orderBy: { sort_order: "asc" } },
      questions: { where: { is_active: true } },
    },
  });

  if (!existing) {
    const created = await transaction.trainingCourse.create({
      data: { slug: course.slug, ...fields, is_published: publish },
    });
    await writeLessons(transaction, created.id, course.lessons, []);
    await writeQuestions(transaction, created.id, course.questions);
    return "created";
  }

  const lessonsChanged =
    JSON.stringify(existing.lessons.map(storedLessonKey)) !==
    JSON.stringify(course.lessons.map(contentLessonKey));
  const questionsChanged =
    JSON.stringify(existing.questions.map(storedQuestionKey).sort()) !==
    JSON.stringify(course.questions.map(contentQuestionKey).sort());
  const metadataChanged =
    Object.entries(fields).some(
      ([key, value]) => existing[key as keyof typeof fields] !== value,
    ) ||
    (publish && !existing.is_published);

  if (lessonsChanged) {
    await writeLessons(
      transaction,
      existing.id,
      course.lessons,
      existing.lessons,
    );
  }
  if (questionsChanged) {
    await transaction.trainingQuestion.updateMany({
      where: { course_id: existing.id, is_active: true },
      data: { is_active: false },
    });
    await writeQuestions(transaction, existing.id, course.questions);
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
  return metadataChanged ? "updated" : "unchanged";
}

/** Updates lessons in place by position so private progress survives. */
async function writeLessons(
  transaction: Prisma.TransactionClient,
  courseId: string,
  lessons: CourseContent["lessons"],
  existing: ReadonlyArray<{ sort_order: number }>,
) {
  for (const [index, lesson] of lessons.entries()) {
    const data = {
      title_en: lesson.titleEn,
      title_bn: lesson.titleBn,
      summary_en: lesson.summaryEn,
      summary_bn: lesson.summaryBn,
      youtube_video_id: lesson.youtubeVideoId,
      duration_s: lesson.durationS,
      is_safety: lesson.isSafety,
    };
    await transaction.trainingLesson.upsert({
      where: {
        course_id_sort_order: { course_id: courseId, sort_order: index + 1 },
      },
      create: { course_id: courseId, sort_order: index + 1, ...data },
      update: data,
    });
  }
  if (existing.length > lessons.length) {
    await transaction.trainingLesson.deleteMany({
      where: { course_id: courseId, sort_order: { gt: lessons.length } },
    });
  }
}

async function writeQuestions(
  transaction: Prisma.TransactionClient,
  courseId: string,
  questions: CourseContent["questions"],
) {
  await transaction.trainingQuestion.createMany({
    data: questions.map((question) => ({
      course_id: courseId,
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
