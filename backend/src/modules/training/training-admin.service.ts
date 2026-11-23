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
  upsertCourse,
} from "./content/training-content.loader";

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
  constructor(private readonly prisma: PrismaService) {}

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
        lessons: { orderBy: { sort_order: "asc" } },
        questions: { where: { is_active: true }, orderBy: { id: "asc" } },
      },
    });
    if (!course) throw new NotFoundException();
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
      })),
      questions: course.questions.map((question) => ({
        promptEn: question.prompt_en,
        promptBn: question.prompt_bn,
        options:
          question.options_json as CourseContent["questions"][number]["options"],
        correctOptionId: question.correct_option_id,
        explanationEn: question.explanation_en,
        explanationBn: question.explanation_bn,
      })),
    };
    return {
      id: course.id,
      version: course.version,
      isPublished: course.is_published,
      document,
    };
  }

  async create(
    raw: unknown,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const course = parseCourse(raw);
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
