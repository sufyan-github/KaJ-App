import { AdminApiError } from "./admin-api.ts";

/**
 * The admin course document (GET/PUT/POST /admin/training/courses) with
 * lesson steps and checkpoint questions, and the pure rules the editor
 * shows. The server checks everything again; these only explain early.
 */

export type StepKind = "LEARN" | "STEP" | "HAZARD" | "REMEMBER";

export const STEP_KINDS: ReadonlyArray<[StepKind, string]> = [
  ["LEARN", "You will learn"],
  ["STEP", "Step"],
  ["HAZARD", "Hazard"],
  ["REMEMBER", "Remember"],
];

export type CourseStep = {
  kind: StepKind;
  en: string;
  bn: string;
  /** imageKey from the step-image upload, or null for a text-only card. */
  image?: string | null;
  altEn?: string | null;
  altBn?: string | null;
  /** Read-only, on GET: a 5-minute signed preview of `image`. */
  imagePreviewUrl?: string | null;
};

export type CourseLesson = {
  titleEn: string;
  titleBn: string;
  summaryEn: string;
  summaryBn: string;
  youtubeVideoId?: string | null;
  durationS?: number;
  isSafety?: boolean;
  steps?: CourseStep[];
  [key: string]: unknown;
};

export type CourseQuestion = {
  promptEn: string;
  promptBn: string;
  options: Array<{ id: string; en: string; bn: string }>;
  correctOptionId: string;
  explanationEn?: string;
  explanationBn?: string;
  /** 1-based lesson number: this question is that lesson's checkpoint. */
  lesson?: number | null;
  [key: string]: unknown;
};

export type CourseDocument = {
  slug: string;
  titleEn: string;
  titleBn: string;
  isSafetyCritical: boolean;
  lessons: CourseLesson[];
  questions: CourseQuestion[];
  [key: string]: unknown;
};

/** A lockedOrder (safety-critical) course needs exactly this many per lesson. */
export const CHECKPOINT_QUESTIONS_PER_LESSON = 2;

export function emptyStep(kind: StepKind = "STEP"): CourseStep {
  return { kind, en: "", bn: "", image: null, altEn: null, altBn: null };
}

/** Checkpoint questions per lesson, index 0 = lesson 1. */
export function checkpointCounts(document: CourseDocument): number[] {
  const counts = document.lessons.map(() => 0);
  for (const question of document.questions) {
    const lesson = question.lesson;
    if (typeof lesson === "number" && lesson >= 1 && lesson <= counts.length)
      counts[lesson - 1]! += 1;
  }
  return counts;
}

/**
 * Lessons (1-based) that block publishing: in a safety-critical course,
 * every lesson needs exactly two checkpoint questions. Empty otherwise.
 */
export function incompleteCheckpointLessons(
  document: CourseDocument,
): number[] {
  if (!document.isSafetyCritical) return [];
  return checkpointCounts(document)
    .map((count, index) => ({ count, lesson: index + 1 }))
    .filter(({ count }) => count !== CHECKPOINT_QUESTIONS_PER_LESSON)
    .map(({ lesson }) => lesson);
}

/** Lesson numbers named in a COURSE_CHECKPOINTS_INCOMPLETE error. */
export function lessonsFromCheckpointError(
  details: ReadonlyArray<{ field?: string; rules?: string[] }> | undefined,
): number[] {
  return (details ?? [])
    .map((detail) => /^lessons\.(\d+)$/u.exec(detail.field ?? "")?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

/** Moves item `from` to `to` (clamped); returns a new array. */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const target = Math.max(0, Math.min(next.length - 1, to));
  const [item] = next.splice(from, 1);
  if (item === undefined) return [...items];
  next.splice(target, 0, item);
  return next;
}

/**
 * Removing lesson `index` (0-based): questions that were its checkpoint lose
 * the link, and later lessons' numbers shift down by one.
 */
export function removeLesson(
  document: CourseDocument,
  index: number,
): CourseDocument {
  const removed = index + 1;
  return {
    ...document,
    lessons: document.lessons.filter((_, i) => i !== index),
    questions: document.questions.map((question) => {
      const lesson = question.lesson;
      if (typeof lesson !== "number") return question;
      if (lesson === removed) return { ...question, lesson: null };
      return lesson > removed ? { ...question, lesson: lesson - 1 } : question;
    }),
  };
}

/** Moving lesson `from` to `to` keeps each checkpoint with its lesson. */
export function moveLesson(
  document: CourseDocument,
  from: number,
  to: number,
): CourseDocument {
  const order = move(
    document.lessons.map((_, i) => i),
    from,
    to,
  );
  const newNumber = new Map(order.map((oldIndex, i) => [oldIndex + 1, i + 1]));
  return {
    ...document,
    lessons: order.map((oldIndex) => document.lessons[oldIndex]!),
    questions: document.questions.map((question) =>
      typeof question.lesson === "number" && newNumber.has(question.lesson)
        ? { ...question, lesson: newNumber.get(question.lesson)! }
        : question,
    ),
  };
}

/**
 * The document to send: read-only preview URLs dropped, empty alt text and
 * missing pictures sent as null, and `lesson` omitted when unset.
 */
export function documentForSave(document: CourseDocument): CourseDocument {
  return {
    ...document,
    lessons: document.lessons.map((lesson) =>
      lesson.steps
        ? {
            ...lesson,
            steps: lesson.steps.map((step) => ({
              kind: step.kind,
              en: step.en.trim(),
              bn: step.bn.trim(),
              image: step.image || null,
              altEn: step.image ? step.altEn?.trim() || null : null,
              altBn: step.image ? step.altBn?.trim() || null : null,
            })),
          }
        : lesson,
    ),
    questions: document.questions.map((question) => {
      const { lesson, ...rest } = question;
      return typeof lesson === "number" ? { ...rest, lesson } : rest;
    }),
  };
}

/** Problems the editor shows before saving (the server has the last word). */
export function documentProblems(document: CourseDocument): string[] {
  const problems: string[] = [];
  document.lessons.forEach((lesson, index) => {
    (lesson.steps ?? []).forEach((step, stepIndex) => {
      const where = `Lesson ${index + 1}, card ${stepIndex + 1}`;
      if (!step.en.trim() || !step.bn.trim())
        problems.push(`${where}: write the text in English and Bangla.`);
      if (step.image && (!step.altEn?.trim() || !step.altBn?.trim()))
        problems.push(`${where}: describe the picture in English and Bangla.`);
    });
  });
  return problems;
}

/** "Lessons 2 and 4" style list for messages. */
export function lessonList(lessons: number[]): string {
  if (lessons.length === 1) return `Lesson ${lessons[0]}`;
  return `Lessons ${lessons.slice(0, -1).join(", ")} and ${lessons.at(-1)}`;
}

/** The message for COURSE_CHECKPOINTS_INCOMPLETE, naming the short lessons. */
export function checkpointRefusal(error: unknown): string | null {
  if (!(error instanceof AdminApiError)) return null;
  if (error.code !== "COURSE_CHECKPOINTS_INCOMPLETE") return null;
  const lessons = lessonsFromCheckpointError(error.details);
  return lessons.length
    ? `${lessonList(lessons)} need exactly ${CHECKPOINT_QUESTIONS_PER_LESSON} checkpoint questions each before this safety-critical course can be published.`
    : `Every lesson needs exactly ${CHECKPOINT_QUESTIONS_PER_LESSON} checkpoint questions before this safety-critical course can be published.`;
}
