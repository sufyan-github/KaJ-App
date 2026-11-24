import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { CLOCK, type Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  certificateInclude,
  serializeCertificate,
  serializeSkillRef,
  type CertificateRecord,
} from "./training-certificates.service";
import { attemptAllowance, FAILED_ATTEMPT_WINDOW_MS } from "./training.rules";
import { storedSteps } from "./content/training-content.loader";
import { TrainingCheckpointsService } from "./training-checkpoints.service";
import { TrainingStepImagesService } from "./training-step-images.service";

/** Step picture URLs: long enough for the app to cache by cacheKey. */
const STEP_IMAGE_URL_SECONDS = 24 * 60 * 60;

export type CourseRelevance = "MY_SKILL" | "GENERAL" | "OTHER";
export type CourseScope = "mine" | "all";

const relevanceRank: Record<CourseRelevance, number> = {
  MY_SKILL: 0,
  GENERAL: 1,
  OTHER: 2,
};

const courseInclude = {
  skill: { select: { id: true, slug: true, name_en: true, name_bn: true } },
  _count: { select: { lessons: true } },
} satisfies Prisma.TrainingCourseInclude;

type CourseRecord = Prisma.TrainingCourseGetPayload<{
  include: typeof courseInclude;
}>;

export function courseRelevance(
  skillId: string | null,
  userSkillIds: ReadonlySet<string>,
): CourseRelevance {
  if (skillId === null) return "GENERAL";
  return userSkillIds.has(skillId) ? "MY_SKILL" : "OTHER";
}

@Injectable()
export class TrainingCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkpoints: TrainingCheckpointsService,
    private readonly images: TrainingStepImagesService,
    @Optional() @Inject(CLOCK) private readonly clock?: Clock,
  ) {}

  private now() {
    return this.clock?.now() ?? new Date();
  }

  async list(userId: string, scope: CourseScope = "mine") {
    const [courses, userSkills] = await Promise.all([
      this.prisma.trainingCourse.findMany({
        where: { is_published: true },
        include: courseInclude,
      }),
      this.userSkillIds(userId),
    ]);
    const ranked = courses
      .map((course) => ({
        course,
        relevance: courseRelevance(course.skill_id, userSkills),
      }))
      .filter(({ relevance }) => scope === "all" || relevance !== "OTHER")
      .sort(
        (a, b) =>
          relevanceRank[a.relevance] - relevanceRank[b.relevance] ||
          a.course.sort_order - b.course.sort_order ||
          a.course.slug.localeCompare(b.course.slug),
      );
    return { items: await this.summarize(userId, ranked) };
  }

  async detail(userId: string, courseId: string) {
    const course = await this.prisma.trainingCourse.findFirst({
      where: { id: courseId, is_published: true },
      include: {
        ...courseInclude,
        lessons: {
          orderBy: { sort_order: "asc" },
          include: {
            steps: { orderBy: { sort_order: "asc" } },
          },
        },
      },
    });
    if (!course) throw new NotFoundException();
    const userSkills = await this.userSkillIds(userId);
    const [summary] = await this.summarize(userId, [
      { course, relevance: courseRelevance(course.skill_id, userSkills) },
    ]);
    const opened = new Set(
      (
        await this.prisma.trainingLessonOpen.findMany({
          where: {
            user_id: userId,
            lesson_id: { in: course.lessons.map((lesson) => lesson.id) },
          },
          select: { lesson_id: true },
        })
      ).map((row) => row.lesson_id),
    );
    const progress = await this.checkpoints.progress(userId, course);
    const progressById = new Map(
      progress.lessons.map((lesson) => [lesson.id, lesson]),
    );
    const lessons = await Promise.all(
      course.lessons.map(async (lesson) => {
        const state = progressById.get(lesson.id)!;
        const ids = new Map(
          lesson.steps.map((step) => [step.sort_order, step.id]),
        );
        return {
          state: state.state,
          checkpoint:
            state.checkpointCount > 0
              ? { questionCount: state.checkpointCount, passed: state.passed }
              : null,
          steps: await Promise.all(
            storedSteps(lesson).map(async (step, index) => ({
              // Derived steps (none stored yet) get a stable synthetic id.
              id: ids.get(index + 1) ?? `${lesson.id}:${index + 1}`,
              kind: step.kind,
              textEn: step.en,
              textBn: step.bn,
              image: step.image
                ? await this.stepImage(lesson, index, step)
                : null,
            })),
          ),
        };
      }),
    );
    return {
      ...summary!,
      lockedOrder: progress.lockedOrder,
      testLocked: progress.testLocked,
      checkpointsPassed: progress.checkpointsPassed,
      checkpointLessons: progress.checkpointLessons,
      lessons: course.lessons.map((lesson, index) => ({
        ...lessons[index]!,
        id: lesson.id,
        sortOrder: lesson.sort_order,
        titleEn: lesson.title_en,
        titleBn: lesson.title_bn,
        summaryEn: lesson.summary_en,
        summaryBn: lesson.summary_bn,
        youtubeVideoId: lesson.youtube_video_id,
        durationS: lesson.duration_s,
        isSafety: lesson.is_safety,
        opened: opened.has(lesson.id),
      })),
    };
  }

  private async stepImage(
    lesson: {
      steps: ReadonlyArray<{
        sort_order: number;
        image_width: number | null;
        image_height: number | null;
      }>;
    },
    index: number,
    step: { image: string | null; altEn: string | null; altBn: string | null },
  ) {
    const row = lesson.steps.find((item) => item.sort_order === index + 1);
    const signed = await this.images.signedImage(
      step.image!,
      STEP_IMAGE_URL_SECONDS,
    );
    return {
      url: signed.url,
      cacheKey: step.image!,
      width: row?.image_width ?? null,
      height: row?.image_height ?? null,
      altEn: step.altEn,
      altBn: step.altBn,
      expiresAt: signed.expiresAt.toISOString(),
    };
  }

  /** Private checklist only: opening a lesson has no other side effect. */
  async openLesson(userId: string, lessonId: string): Promise<void> {
    const lesson = await this.prisma.trainingLesson.findFirst({
      where: { id: lessonId, course: { is_published: true } },
      select: { id: true },
    });
    if (!lesson) throw new NotFoundException();
    const now = this.now();
    await this.prisma.trainingLessonOpen.upsert({
      where: { user_id_lesson_id: { user_id: userId, lesson_id: lessonId } },
      create: {
        user_id: userId,
        lesson_id: lessonId,
        first_opened_at: now,
        last_opened_at: now,
      },
      update: { last_opened_at: now },
    });
  }

  /** Builds CourseSummary rows with a fixed number of queries. */
  private async summarize(
    userId: string,
    ranked: Array<{ course: CourseRecord; relevance: CourseRelevance }>,
  ) {
    if (ranked.length === 0) return [];
    const courseIds = ranked.map(({ course }) => course.id);
    const windowStart = new Date(
      this.now().getTime() - FAILED_ATTEMPT_WINDOW_MS,
    );
    const [opens, certificates, failures] = await Promise.all([
      this.prisma.trainingLessonOpen.findMany({
        where: { user_id: userId, lesson: { course_id: { in: courseIds } } },
        select: { lesson: { select: { course_id: true } } },
      }),
      this.prisma.trainingCertificate.findMany({
        where: {
          user_id: userId,
          course_id: { in: courseIds },
          revoked_at: null,
        },
        include: certificateInclude,
        orderBy: { issued_at: "desc" },
      }),
      this.prisma.trainingAttempt.findMany({
        where: {
          user_id: userId,
          course_id: { in: courseIds },
          passed: false,
          submitted_at: { gt: windowStart },
        },
        select: { course_id: true, submitted_at: true },
      }),
    ]);
    const openedByCourse = countBy(opens.map((row) => row.lesson.course_id));
    const failuresByCourse = new Map<string, Date[]>();
    for (const failure of failures) {
      const list = failuresByCourse.get(failure.course_id) ?? [];
      list.push(failure.submitted_at!);
      failuresByCourse.set(failure.course_id, list);
    }
    const courseById = new Map(ranked.map(({ course }) => [course.id, course]));
    // Only a certificate for the current course version counts here.
    const certificateByCourse = new Map<string, CertificateRecord>();
    for (const certificate of certificates) {
      if (!certificate.course_id) continue;
      const course = courseById.get(certificate.course_id);
      if (
        course &&
        certificate.course_version === course.version &&
        !certificateByCourse.has(course.id)
      ) {
        certificateByCourse.set(course.id, certificate);
      }
    }
    const now = this.now();
    return ranked.map(({ course, relevance }) => {
      const allowance = attemptAllowance(
        failuresByCourse.get(course.id) ?? [],
        now,
      );
      const certificate = certificateByCourse.get(course.id);
      return {
        id: course.id,
        slug: course.slug,
        titleEn: course.title_en,
        titleBn: course.title_bn,
        summaryEn: course.summary_en,
        summaryBn: course.summary_bn,
        skill: serializeSkillRef(course.skill),
        minutes: course.minutes,
        estDataMb: course.est_data_mb,
        lessonCount: course._count.lessons,
        passMarkPct: course.pass_mark_pct,
        questionCount: course.question_count,
        isSafetyCritical: course.is_safety_critical,
        relevance,
        progress: {
          lessonsOpened: openedByCourse.get(course.id) ?? 0,
          lessonCount: course._count.lessons,
        },
        certificate: certificate ? serializeCertificate(certificate) : null,
        attemptsLeftToday: allowance.attemptsLeftToday,
        nextAttemptAt: allowance.nextAttemptAt?.toISOString() ?? null,
      };
    });
  }

  private async userSkillIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userSkill.findMany({
      where: { user_id: userId },
      select: { skill_id: true },
    });
    return new Set(rows.map((row) => row.skill_id));
  }
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
