import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";

import { CLOCK, type Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  checkpointAnswersInvalidError,
  checkpointUnavailableError,
  lessonLockedError,
} from "./training.errors";
import { parseOptions } from "./training.rules";

export type LessonState = "OPEN" | "LOCKED" | "DONE";

export interface LessonProgress {
  id: string;
  sortOrder: number;
  checkpointCount: number;
  passed: boolean;
  opened: boolean;
  state: LessonState;
}

export interface CourseProgress {
  lockedOrder: boolean;
  testLocked: boolean;
  checkpointsPassed: number;
  checkpointLessons: number;
  lessons: LessonProgress[];
}

/**
 * The lesson states. A lesson is DONE when its checkpoint is passed (one
 * without a checkpoint: once opened). Only a locked-order course locks: a
 * lesson after one that is not DONE is LOCKED, and so is the final test.
 */
export function lessonStates(
  lockedOrder: boolean,
  lessons: ReadonlyArray<Omit<LessonProgress, "state">>,
): CourseProgress {
  let blocked = false;
  const withState = lessons.map((lesson) => {
    const done = lesson.checkpointCount > 0 ? lesson.passed : lesson.opened;
    const state: LessonState = done
      ? "DONE"
      : lockedOrder && blocked
        ? "LOCKED"
        : "OPEN";
    if (!done) blocked = true;
    return { ...lesson, state };
  });
  return {
    lockedOrder,
    testLocked:
      lockedOrder && withState.some((lesson) => lesson.state !== "DONE"),
    checkpointsPassed: withState.filter(
      (lesson) => lesson.checkpointCount > 0 && lesson.passed,
    ).length,
    checkpointLessons: withState.filter((lesson) => lesson.checkpointCount > 0)
      .length,
    lessons: withState,
  };
}

/**
 * Lesson checkpoints: a lesson's checkpoint questions, both right to pass,
 * unlimited tries. Never part of the certificate, never sends the correct
 * option. A pass counts for the lesson revision it was made on.
 */
@Injectable()
export class TrainingCheckpointsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CLOCK) private readonly clock?: Clock,
  ) {}

  private now() {
    return this.clock?.now() ?? new Date();
  }

  async progress(
    userId: string,
    course: { id: string; is_safety_critical: boolean },
  ): Promise<CourseProgress> {
    const lessons = await this.prisma.trainingLesson.findMany({
      where: { course_id: course.id },
      orderBy: { sort_order: "asc" },
      select: { id: true, sort_order: true, revision: true },
    });
    const ids = lessons.map((lesson) => lesson.id);
    const [counts, passes, opens] = await Promise.all([
      this.prisma.trainingQuestion.groupBy({
        by: ["lesson_id"],
        where: { lesson_id: { in: ids }, is_active: true },
        _count: { _all: true },
      }),
      this.prisma.trainingLessonCheckpoint.findMany({
        where: {
          user_id: userId,
          lesson_id: { in: ids },
          passed_at: { not: null },
        },
        select: { lesson_id: true, lesson_revision: true },
      }),
      this.prisma.trainingLessonOpen.findMany({
        where: { user_id: userId, lesson_id: { in: ids } },
        select: { lesson_id: true },
      }),
    ]);
    const countBy = new Map(
      counts.map((row) => [row.lesson_id, row._count._all]),
    );
    const passedRevision = new Map(
      passes.map((row) => [row.lesson_id, row.lesson_revision]),
    );
    const opened = new Set(opens.map((row) => row.lesson_id));
    return lessonStates(
      course.is_safety_critical,
      lessons.map((lesson) => ({
        id: lesson.id,
        sortOrder: lesson.sort_order,
        checkpointCount: countBy.get(lesson.id) ?? 0,
        passed: passedRevision.get(lesson.id) === lesson.revision,
        opened: opened.has(lesson.id),
      })),
    );
  }

  async get(userId: string, lessonId: string) {
    const { lesson, progress, questions } = await this.load(userId, lessonId);
    return {
      lessonId: lesson.id,
      passed: progress.lessons.find((item) => item.id === lesson.id)!.passed,
      questions: questions.map((question) => ({
        id: question.id,
        promptEn: question.prompt_en,
        promptBn: question.prompt_bn,
        options: parseOptions(question.options_json),
      })),
    };
  }

  async submit(
    userId: string,
    lessonId: string,
    answers: ReadonlyArray<{ questionId: string; optionId: string }>,
  ) {
    const { lesson, course, progress, questions } = await this.load(
      userId,
      lessonId,
    );
    const byId = new Map(questions.map((question) => [question.id, question]));
    const answered = new Set(answers.map((answer) => answer.questionId));
    if (
      answered.size !== answers.length ||
      answered.size !== questions.length ||
      answers.some((answer) => !byId.has(answer.questionId))
    )
      throw checkpointAnswersInvalidError(
        "Answer each of this lesson's questions once.",
      );
    const results = answers.map((answer) => {
      const question = byId.get(answer.questionId)!;
      const options = parseOptions(question.options_json);
      if (!options.some((option) => option.id === answer.optionId))
        throw checkpointAnswersInvalidError(
          `Unknown option for question ${answer.questionId}.`,
        );
      return {
        questionId: question.id,
        correct: answer.optionId === question.correct_option_id,
        explanationEn: question.explanation_en,
        explanationBn: question.explanation_bn,
      };
    });
    const passed = results.every((result) => result.correct);
    const alreadyPassed = progress.lessons.find(
      (item) => item.id === lesson.id,
    )!.passed;
    if (!alreadyPassed) {
      const now = this.now();
      await this.prisma.trainingLessonCheckpoint.upsert({
        where: { user_id_lesson_id: { user_id: userId, lesson_id: lesson.id } },
        create: {
          user_id: userId,
          lesson_id: lesson.id,
          course_version: course.version,
          lesson_revision: lesson.revision,
          attempts: 1,
          last_attempt_at: now,
          passed_at: passed ? now : null,
        },
        update: {
          attempts: { increment: 1 },
          last_attempt_at: now,
          ...(passed
            ? {
                passed_at: now,
                course_version: course.version,
                lesson_revision: lesson.revision,
              }
            : {}),
        },
      });
    }
    const after = await this.progress(userId, course);
    const index = after.lessons.findIndex((item) => item.id === lesson.id);
    const next = after.lessons[index + 1] ?? null;
    return {
      passed,
      results,
      lessonState: after.lessons[index]!.state === "DONE" ? "DONE" : "OPEN",
      nextLessonId: next?.id ?? null,
      nextLessonState: next?.state ?? null,
      testLocked: after.testLocked,
    };
  }

  private async load(userId: string, lessonId: string) {
    const lesson = await this.prisma.trainingLesson.findFirst({
      where: { id: lessonId, course: { is_published: true } },
      select: {
        id: true,
        revision: true,
        course: {
          select: { id: true, version: true, is_safety_critical: true },
        },
      },
    });
    if (!lesson) throw new NotFoundException();
    const progress = await this.progress(userId, lesson.course);
    if (
      progress.lessons.find((item) => item.id === lesson.id)!.state === "LOCKED"
    )
      throw lessonLockedError();
    const questions = await this.prisma.trainingQuestion.findMany({
      where: { lesson_id: lesson.id, is_active: true },
      orderBy: [{ sort_order: "asc" }, { id: "asc" }],
    });
    if (questions.length === 0) throw checkpointUnavailableError();
    return { lesson, course: lesson.course, progress, questions };
  }
}
