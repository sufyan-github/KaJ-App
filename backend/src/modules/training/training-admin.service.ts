import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import {
  CourseContent,
  courseSchema,
  lessonSteps,
  lessonsWithoutTwoCheckpoints,
  storedSteps,
  upsertCourse,
} from "./content/training-content.loader";
import {
  TrainingStepImagesService,
  trainingImageInvalid,
} from "./training-step-images.service";

const PREVIEW_SECONDS = 5 * 60;

/** 409: a locked-order course needs two checkpoint questions per lesson. */
export function checkpointsIncompleteError(lessons: readonly number[]) {
  return new ConflictException({
    code: "COURSE_CHECKPOINTS_INCOMPLETE",
    message: `A safety-critical course needs exactly 2 checkpoint questions for every lesson (lessons ${lessons.join(", ")} do not).`,
    messageKey: "error.training.checkpoints_incomplete",
    details: lessons.map((lesson) => ({
      field: `lessons.${lesson - 1}`,
      rules: ["checkpoint_count"],
    })),
  });
}

/**
 * P1.5 course authoring. A course is edited as one document (metadata,
 * lessons, questions) in the same format as the seed file, through the
 * loader's upsert, so the rules are identical: a content change bumps the
 * version (earlier certificates stop counting for it), replaced questions
 * are deactivated (old attempts stay readable), lesson progress survives.
 * Publishing is a separate, audited action.
 */
@Injectable()
export class TrainingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: TrainingStepImagesService,
  ) {}

  async list() {
    const rows = await this.prisma.trainingCourse.findMany({
      include: {
        skill: { select: { slug: true, name_en: true, name_bn: true } },
        _count: {
          select: {
            lessons: true,
            questions: { where: { is_active: true } },
            certificates: true,
          },
        },
      },
      orderBy: [{ sort_order: "asc" }, { slug: "asc" }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        titleEn: row.title_en,
        titleBn: row.title_bn,
        skill: row.skill
          ? {
              slug: row.skill.slug,
              nameEn: row.skill.name_en,
              nameBn: row.skill.name_bn,
            }
          : null,
        isPublished: row.is_published,
        version: row.version,
        lessons: row._count.lessons,
        activeQuestions: row._count.questions,
        certificates: row._count.certificates,
        updatedAt: row.updated_at.toISOString(),
      })),
    };
  }

  /** The editable document (includes correct answers: admin only). */
  async document(id: string) {
    const course = await this.prisma.trainingCourse.findUnique({
      where: { id },
      include: {
        skill: { select: { slug: true } },
        lessons: {
          orderBy: { sort_order: "asc" },
          include: { steps: { orderBy: { sort_order: "asc" } } },
        },
        questions: {
          where: { is_active: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
    });
    if (!course) throw new NotFoundException();
    const lessonNumber = new Map(
      course.lessons.map((lesson, index) => [lesson.id, index + 1]),
    );
    const document: CourseContent = {
      slug: course.slug,
      skillSlug: course.skill?.slug ?? null,
      titleEn: course.title_en,
      titleBn: course.title_bn,
      summaryEn: course.summary_en,
      summaryBn: course.summary_bn,
      minutes: course.minutes,
      estDataMb: course.est_data_mb,
      passMarkPct: course.pass_mark_pct,
      questionCount: course.question_count,
      isSafetyCritical: course.is_safety_critical,
      sortOrder: course.sort_order,
      lessons: course.lessons.map((lesson) => ({
        titleEn: lesson.title_en,
        titleBn: lesson.title_bn,
        summaryEn: lesson.summary_en,
        summaryBn: lesson.summary_bn,
        youtubeVideoId: lesson.youtube_video_id,
        durationS: lesson.duration_s,
        isSafety: lesson.is_safety,
        // Stored steps, or the ones derived from the summary (round-trips).
        steps: storedSteps(lesson),
      })),
      questions: course.questions.map((question) => ({
        promptEn: question.prompt_en,
        promptBn: question.prompt_bn,
        options:
          question.options_json as CourseContent["questions"][number]["options"],
        correctOptionId: question.correct_option_id,
        explanationEn: question.explanation_en,
        explanationBn: question.explanation_bn,
        lesson: question.lesson_id
          ? (lessonNumber.get(question.lesson_id) ?? null)
          : null,
      })),
    };
    // Read-only previews for the editor; not part of the saved document.
    const lessons = await Promise.all(
      document.lessons.map(async (lesson) => ({
        ...lesson,
        steps: await Promise.all(
          (lesson.steps ?? []).map(async (step) => ({
            ...step,
            imagePreviewUrl: step.image
              ? await this.images.url(step.image, PREVIEW_SECONDS)
              : null,
          })),
        ),
      })),
    );
    return {
      id: course.id,
      version: course.version,
      isPublished: course.is_published,
      document: { ...document, lessons },
    };
  }

  async create(
    raw: unknown,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const course = parseCourse(raw);
    await this.assertImagesExist(course, new Set());
    const exists = await this.prisma.trainingCourse.findUnique({
      where: { slug: course.slug },
      select: { id: true },
    });
    if (exists)
      throw new ConflictException({
        code: "COURSE_SLUG_TAKEN",
        message: "A course with this slug already exists.",
        messageKey: "error.training.slug_taken",
      });
    const skillId = await this.skillId(course.skillSlug);
    const created = await this.prisma.$transaction(async (transaction) => {
      await upsertCourse(transaction, course, skillId, false);
      const saved = await transaction.trainingCourse.findUniqueOrThrow({
        where: { slug: course.slug },
      });
      await transaction.auditLog.create({
        data: audit(actor, context, "ADMIN_COURSE_CREATED", saved.id, null, {
          slug: course.slug,
          version: saved.version,
          reason,
        }),
      });
      return saved;
    });
    return this.document(created.id);
  }

  async update(
    id: string,
    raw: unknown,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const course = parseCourse(raw);
    const existing = await this.prisma.trainingCourse.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException();
    if (existing.slug !== course.slug)
      throw new BadRequestException({
        code: "COURSE_SLUG_IMMUTABLE",
        message: "A course's slug can't change.",
        messageKey: "error.training.slug_immutable",
        field: "slug",
      });
    if (existing.is_published && course.isSafetyCritical) {
      const missing = lessonsWithoutTwoCheckpoints(
        course.lessons.length,
        course.questions.map((question) => question.lesson),
      );
      if (missing.length > 0) throw checkpointsIncompleteError(missing);
    }
    const imagesBefore = await this.courseImageKeys(id);
    await this.assertImagesExist(course, imagesBefore);
    const skillId = await this.skillId(course.skillSlug);
    const outcome = await this.prisma.$transaction(async (transaction) => {
      const result = await upsertCourse(transaction, course, skillId, false);
      const saved = await transaction.trainingCourse.findUniqueOrThrow({
        where: { id },
      });
      if (result !== "unchanged")
        await transaction.auditLog.create({
          data: audit(
            actor,
            context,
            "ADMIN_COURSE_UPDATED",
            id,
            { version: existing.version },
            { version: saved.version, outcome: result, reason },
          ),
        });
      return result;
    });
    // A picture no step uses any more is deleted from storage.
    const imagesAfter = await this.courseImageKeys(id);
    for (const key of imagesBefore) {
      if (imagesAfter.has(key)) continue;
      const elsewhere = await this.prisma.trainingLessonStep.count({
        where: { image_key: key },
      });
      if (elsewhere === 0) await this.images.remove(key);
    }
    return { outcome, ...(await this.document(id)) };
  }

  async setPublished(
    id: string,
    published: boolean,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const existing = await this.prisma.trainingCourse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            lessons: true,
            questions: { where: { is_active: true } },
          },
        },
      },
    });
    if (!existing) throw new NotFoundException();
    if (published && existing._count.lessons < 1)
      throw new ConflictException({
        code: "COURSE_HAS_NO_LESSONS",
        message: "A course needs at least one lesson before publishing.",
        messageKey: "error.training.no_lessons",
      });
    if (published && existing._count.questions < 1)
      throw new ConflictException(
        "A course needs questions before publishing.",
      );
    if (published && existing.is_safety_critical) {
      const [lessons, checkpoints] = await Promise.all([
        this.prisma.trainingLesson.findMany({
          where: { course_id: id },
          orderBy: { sort_order: "asc" },
          select: { id: true },
        }),
        this.prisma.trainingQuestion.findMany({
          where: { course_id: id, is_active: true, lesson_id: { not: null } },
          select: { lesson_id: true },
        }),
      ]);
      const number = new Map(
        lessons.map((lesson, index) => [lesson.id, index + 1]),
      );
      const missing = lessonsWithoutTwoCheckpoints(
        lessons.length,
        checkpoints.map((row) => number.get(row.lesson_id!) ?? null),
      );
      if (missing.length > 0) throw checkpointsIncompleteError(missing);
    }
    await this.prisma.$transaction([
      this.prisma.trainingCourse.update({
        where: { id },
        data: { is_published: published },
      }),
      this.prisma.auditLog.create({
        data: audit(
          actor,
          context,
          published ? "ADMIN_COURSE_PUBLISHED" : "ADMIN_COURSE_UNPUBLISHED",
          id,
          { isPublished: existing.is_published },
          { isPublished: published, reason },
        ),
      }),
    ]);
    return this.document(id);
  }

  private async courseImageKeys(courseId: string): Promise<Set<string>> {
    const rows = await this.prisma.trainingLessonStep.findMany({
      where: { lesson: { course_id: courseId }, image_key: { not: null } },
      select: { image_key: true },
    });
    return new Set(rows.map((row) => row.image_key!));
  }

  /** Every new picture key must be an uploaded step picture. */
  private async assertImagesExist(
    course: CourseContent,
    known: ReadonlySet<string>,
  ) {
    for (const [index, lesson] of course.lessons.entries())
      for (const step of lessonSteps(lesson))
        if (
          step.image &&
          !known.has(step.image) &&
          !(await this.images.exists(step.image))
        )
          throw trainingImageInvalid(
            `Lesson ${index + 1}: the picture ${step.image} was not uploaded (use the step picture upload first).`,
          );
  }

  private async skillId(slug: string | null) {
    if (!slug) return null;
    const skill = await this.prisma.skill.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!skill)
      throw new BadRequestException({
        code: "VALIDATION_FAILED",
        message: `Unknown skill: ${slug}`,
        messageKey: "error.validation.failed",
        field: "skillSlug",
      });
    return skill.id;
  }
}

function parseCourse(raw: unknown): CourseContent {
  const parsed = courseSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0]!;
  throw new BadRequestException({
    code: "VALIDATION_FAILED",
    message: `${issue.path.join(".") || "course"}: ${issue.message}`,
    messageKey: "error.validation.failed",
    field: issue.path.join(".") || null,
    details: parsed.error.issues.slice(0, 20).map((item) => ({
      field: item.path.join("."),
      rules: [item.code],
    })),
  });
}

function audit(
  actor: AdminActor,
  context: AdminRequestContext,
  action: string,
  entityId: string,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
): Prisma.AuditLogUncheckedCreateInput {
  return {
    actor_user_id: actor.userId,
    action,
    entity: "TRAINING_COURSE",
    entity_id: entityId,
    before_json: before ?? Prisma.JsonNull,
    after_json: after ?? Prisma.JsonNull,
    ip: context.ip,
    ua: context.ua,
  };
}
