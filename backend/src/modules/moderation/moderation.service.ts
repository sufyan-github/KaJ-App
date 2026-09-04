import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ModerationLevel,
  Prisma,
  ReportStatus,
  TrustLevel,
  UserStatus,
} from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import {
  CreateReportDto,
  DirectModerationDto,
  ModerationDecisionDto,
  ReportQueueQueryDto,
  ReportTargetType,
} from "./dto/moderation.dto";

const NEXT_LEVEL: Record<ModerationLevel, ModerationLevel | null> = {
  NONE: ModerationLevel.WARN,
  WARN: ModerationLevel.RESTRICT,
  RESTRICT: ModerationLevel.SUSPEND,
  SUSPEND: ModerationLevel.BAN,
  BAN: null,
};

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createReport(reporterUserId: string, input: CreateReportDto) {
    const subjectUserId = await this.resolveSubject(
      reporterUserId,
      input.targetType,
      input.targetId,
    );
    if (subjectUserId === reporterUserId) {
      throw new BadRequestException("You cannot report yourself.");
    }
    const duplicateAfter = new Date(this.clock.now().getTime() - 86_400_000);
    const duplicate = await this.prisma.report.findFirst({
      where: {
        reporter_user_id: reporterUserId,
        target_type: input.targetType,
        target_id: input.targetId,
        reason_code: input.reasonCode,
        created_at: { gte: duplicateAfter },
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        "An equivalent report was already submitted in the last 24 hours.",
      );
    }
    const report = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.report.create({
        data: {
          reporter_user_id: reporterUserId,
          subject_user_id: subjectUserId,
          target_type: input.targetType,
          target_id: input.targetId,
          reason_code: input.reasonCode,
          description: input.description.trim(),
        },
      });
      await transaction.auditLog.create({
        data: {
          actor_user_id: reporterUserId,
          action: "SAFETY_REPORT_SUBMITTED",
          entity: "REPORT",
          entity_id: created.id,
          after_json: {
            targetType: input.targetType,
            targetId: input.targetId,
            reasonCode: input.reasonCode,
          },
        },
      });
      return created;
    });
    return {
      id: report.id,
      status: report.status,
      createdAt: report.created_at.toISOString(),
    };
  }

  async mine(userId: string) {
    const items = await this.prisma.report.findMany({
      where: { reporter_user_id: userId },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        targetType: item.target_type,
        targetId: item.target_id,
        reasonCode: item.reason_code,
        status: item.status,
        resolution: item.resolution,
        createdAt: item.created_at.toISOString(),
        reviewedAt: item.reviewed_at?.toISOString() ?? null,
      })),
    };
  }

  async blocks(userId: string) {
    const items = await this.prisma.userBlock.findMany({
      where: { blocker_user_id: userId },
      include: {
        blocked: {
          include: { profile: { select: { display_name: true } } },
        },
      },
      orderBy: { created_at: "desc" },
    });
    return {
      items: items.map((item) => ({
        userId: item.blocked_user_id,
        displayName: item.blocked.profile?.display_name ?? "KAAJ user",
        blockedAt: item.created_at.toISOString(),
      })),
    };
  }

  async queue(
    query: ReportQueueQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.ReportWhereInput = query.status
      ? { status: query.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        orderBy: { created_at: "asc" },
        take: query.limit,
        include: {
          reporter: { include: { profile: true } },
          subject: { include: { profile: true } },
          reviewer: { include: { profile: true } },
          moderation_actions: { orderBy: { created_at: "desc" } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    await this.audit(
      actor,
      "ADMIN_REPORT_QUEUE_VIEWED",
      "REPORT",
      null,
      { status: query.status ?? null, limit: query.limit },
      context,
    );
    return {
      total,
      items: items.map((item) => ({
        id: item.id,
        targetType: item.target_type,
        targetId: item.target_id,
        reasonCode: item.reason_code,
        description: item.description,
        status: item.status,
        resolution: item.resolution,
        createdAt: item.created_at,
        reviewedAt: item.reviewed_at,
        reporter: {
          id: item.reporter.id,
          name: item.reporter.profile?.display_name ?? "Unknown",
        },
        subject: item.subject
          ? {
              id: item.subject.id,
              name: item.subject.profile?.display_name ?? "Unknown",
              status: item.subject.status,
              moderationLevel: item.subject.moderation_level,
              reverificationRequired: item.subject.reverification_required,
            }
          : null,
        reviewer: item.reviewer
          ? {
              id: item.reviewer.id,
              name: item.reviewer.profile?.display_name ?? "Admin",
            }
          : null,
        actions: item.moderation_actions,
      })),
    };
  }

  async startReview(
    reportId: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException();
    if (report.status !== ReportStatus.OPEN) {
      throw new ConflictException("Only open reports can enter review.");
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.report.updateMany({
        where: { id: reportId, status: ReportStatus.OPEN },
        data: {
          status: ReportStatus.UNDER_REVIEW,
          reviewer_user_id: actor.userId,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Only open reports can enter review.");
      }
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_REPORT_REVIEW_STARTED",
          "REPORT",
          reportId,
          { status: report.status },
          { status: ReportStatus.UNDER_REVIEW },
          context,
        ),
      });
      return { id: reportId, status: ReportStatus.UNDER_REVIEW };
    });
    return { id: updated.id, status: updated.status };
  }

  async decide(
    reportId: string,
    input: ModerationDecisionDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (
      input.status !== ReportStatus.ACTIONED &&
      input.status !== ReportStatus.DISMISSED
    ) {
      throw new BadRequestException(
        "A report decision must be actioned or dismissed.",
      );
    }
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException();
    if (
      report.status !== ReportStatus.OPEN &&
      report.status !== ReportStatus.UNDER_REVIEW
    ) {
      throw new ConflictException("This report already has a decision.");
    }
    if (input.status === ReportStatus.DISMISSED) {
      if (input.action) {
        throw new BadRequestException(
          "A dismissed report cannot include a moderation action.",
        );
      }
      await this.prisma.$transaction(async (transaction) => {
        const decided = await transaction.report.updateMany({
          where: {
            id: reportId,
            status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] },
          },
          data: {
            status: ReportStatus.DISMISSED,
            reviewer_user_id: actor.userId,
            resolution: input.reason.trim(),
            reviewed_at: this.clock.now(),
          },
        });
        if (decided.count !== 1) {
          throw new ConflictException("This report already has a decision.");
        }
        await transaction.auditLog.create({
          data: this.auditData(
            actor,
            "ADMIN_REPORT_DISMISSED",
            "REPORT",
            reportId,
            { status: report.status },
            { status: ReportStatus.DISMISSED, reason: input.reason.trim() },
            context,
          ),
        });
      });
      return { id: reportId, status: ReportStatus.DISMISSED };
    }
    if (!input.action || input.action === ModerationLevel.NONE) {
      throw new BadRequestException(
        "An actioned report requires a moderation level.",
      );
    }
    if (!report.subject_user_id) {
      throw new ConflictException("The report has no actionable user subject.");
    }
    return this.applyLevel(
      report.subject_user_id,
      {
        action: input.action,
        reason: input.reason,
        durationDays: input.durationDays,
        requireReverification: input.requireReverification,
      },
      actor,
      context,
      report,
    );
  }

  moderateUser(
    userId: string,
    input: DirectModerationDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (input.action === ModerationLevel.NONE) {
      throw new BadRequestException("Use restore to clear moderation.");
    }
    return this.applyLevel(userId, input, actor, context, null);
  }

  async restoreUser(
    userId: string,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    if (userId === actor.userId) {
      throw new ConflictException("Admins cannot moderate their own account.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.reverification_required) {
      throw new ConflictException(
        "Required identity re-verification must be approved before restoration.",
      );
    }
    const previous = effectiveLevel(user);
    if (
      previous === ModerationLevel.NONE &&
      user.status === UserStatus.ACTIVE
    ) {
      throw new ConflictException("The account is already active.");
    }
    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const restored = await transaction.user.updateMany({
        where: {
          id: userId,
          status: user.status,
          moderation_level: user.moderation_level,
          reverification_required: false,
        },
        data: {
          status: UserStatus.ACTIVE,
          moderation_level: ModerationLevel.NONE,
          restriction_ends_at: null,
          moderation_reason: null,
        },
      });
      if (restored.count !== 1) {
        throw new ConflictException(
          "The account moderation state changed; reload and try again.",
        );
      }
      await transaction.moderationAction.create({
        data: {
          admin_user_id: actor.userId,
          target_type: "USER",
          target_id: userId,
          action: "RESTORE",
          previous_level: previous,
          level: ModerationLevel.NONE,
          reason: reason.trim(),
          created_at: now,
          review_due_at: new Date(now.getTime() + 48 * 3_600_000),
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_USER_RESTORED",
          "USER",
          userId,
          { status: user.status, moderationLevel: previous },
          { status: UserStatus.ACTIVE, moderationLevel: ModerationLevel.NONE },
          context,
        ),
      });
      await transaction.notification.create({
        data: {
          user_id: userId,
          type: "MODERATION_RESTORED",
          title_key: "moderation.restored.title",
          body_key: "moderation.restored.body",
          payload_json: { moderationLevel: ModerationLevel.NONE },
        },
      });
    });
    return {
      id: userId,
      status: UserStatus.ACTIVE,
      moderationLevel: ModerationLevel.NONE,
    };
  }

  async completePostIncidentReview(
    actionId: string,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const action = await this.prisma.moderationAction.findUnique({
      where: { id: actionId },
    });
    if (!action) throw new NotFoundException();
    if (action.reviewed_at) {
      throw new ConflictException("Post-incident review is already complete.");
    }
    const reviewedAt = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const completed = await transaction.moderationAction.updateMany({
        where: { id: actionId, reviewed_at: null },
        data: { reviewed_at: reviewedAt },
      });
      if (completed.count !== 1) {
        throw new ConflictException(
          "Post-incident review is already complete.",
        );
      }
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_POST_INCIDENT_REVIEW_COMPLETED",
          "MODERATION_ACTION",
          actionId,
          null,
          { reason: reason.trim(), reviewedAt: reviewedAt.toISOString() },
          context,
        ),
      });
    });
    return { id: actionId, reviewedAt };
  }

  private async applyLevel(
    userId: string,
    input: DirectModerationDto,
    actor: AdminActor,
    context: AdminRequestContext,
    report: {
      id: string;
      status: ReportStatus;
      subject_user_id: string | null;
    } | null,
  ) {
    if (userId === actor.userId) {
      throw new ConflictException("Admins cannot moderate their own account.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const previous = effectiveLevel(user);
    const expected = NEXT_LEVEL[previous];
    if (input.action !== expected) {
      throw new ConflictException(
        expected
          ? `The next allowed moderation level is ${expected}.`
          : "The account is already at the final moderation level.",
      );
    }
    if (
      input.requireReverification &&
      input.action !== ModerationLevel.RESTRICT
    ) {
      throw new BadRequestException(
        "Re-verification can be required only at the restriction step.",
      );
    }
    const now = this.clock.now();
    const durationDays = input.durationDays ?? 7;
    const expiresAt =
      input.action === ModerationLevel.RESTRICT ||
      input.action === ModerationLevel.SUSPEND
        ? new Date(now.getTime() + durationDays * 86_400_000)
        : null;
    const status = statusForLevel(input.action);
    await this.prisma.$transaction(async (transaction) => {
      const advanced = await transaction.user.updateMany({
        where: {
          id: userId,
          status: user.status,
          moderation_level: user.moderation_level,
        },
        data: {
          status,
          moderation_level: input.action,
          restriction_ends_at: expiresAt,
          moderation_reason: input.reason.trim(),
          ...(input.requireReverification
            ? {
                reverification_required: true,
                reverification_requested_at: now,
              }
            : {}),
        },
      });
      if (advanced.count !== 1) {
        throw new ConflictException(
          "The account moderation state changed; reload and try again.",
        );
      }
      if (input.requireReverification) {
        await transaction.profile.updateMany({
          where: { user_id: userId },
          data: { trust_level: TrustLevel.PHONE },
        });
        await transaction.userBadge.updateMany({
          where: {
            user_id: userId,
            revoked_at: null,
            badge: { slug: { in: ["verified", "business-verified"] } },
          },
          data: { revoked_at: now },
        });
      }
      if (
        input.action === ModerationLevel.RESTRICT ||
        input.action === ModerationLevel.SUSPEND ||
        input.action === ModerationLevel.BAN
      ) {
        await transaction.refreshToken.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: now },
        });
        await transaction.adminSession.updateMany({
          where: { user_id: userId, revoked_at: null },
          data: { revoked_at: now },
        });
      }
      const action = await transaction.moderationAction.create({
        data: {
          admin_user_id: actor.userId,
          report_id: report?.id,
          target_type: "USER",
          target_id: userId,
          action: input.action,
          previous_level: previous,
          level: input.action,
          reason: input.reason.trim(),
          created_at: now,
          expires_at: expiresAt,
          requires_reverification: input.requireReverification ?? false,
          review_due_at: new Date(now.getTime() + 48 * 3_600_000),
        },
      });
      if (report) {
        await transaction.report.update({
          where: { id: report.id },
          data: {
            status: ReportStatus.ACTIONED,
            reviewer_user_id: actor.userId,
            resolution: input.reason.trim(),
            reviewed_at: now,
          },
        });
      }
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          "ADMIN_MODERATION_LEVEL_CHANGED",
          "USER",
          userId,
          { status: user.status, moderationLevel: previous },
          {
            status,
            moderationLevel: input.action,
            reportId: report?.id ?? null,
            actionId: action.id,
            requireReverification: input.requireReverification ?? false,
          },
          context,
        ),
      });
      await transaction.notification.create({
        data: {
          user_id: userId,
          type: "MODERATION_ACTION",
          title_key: "moderation.action.title",
          body_key: "moderation.action.body",
          payload_json: {
            level: input.action,
            expiresAt: expiresAt?.toISOString() ?? null,
            reverificationRequired: input.requireReverification ?? false,
          },
        },
      });
    });
    return {
      id: userId,
      reportId: report?.id ?? null,
      status,
      moderationLevel: input.action,
      expiresAt,
      reverificationRequired: input.requireReverification ?? false,
    };
  }

  private async resolveSubject(
    reporterUserId: string,
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<string | null> {
    if (targetType === "USER") {
      const user = await this.prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException();
      return user.id;
    }
    if (targetType === "JOB") {
      const job = await this.prisma.job.findFirst({
        where: { id: targetId, deleted_at: null },
        select: { poster_user_id: true },
      });
      if (!job) throw new NotFoundException();
      return job.poster_user_id;
    }
    if (targetType === "CONVERSATION") {
      const conversation = await this.prisma.conversation.findFirst({
        where: {
          id: targetId,
          deleted_at: null,
          participants: { some: { user_id: reporterUserId } },
        },
        include: { participants: true },
      });
      if (!conversation) throw new NotFoundException();
      return (
        conversation.participants.find(
          (item) => item.user_id !== reporterUserId,
        )?.user_id ?? null
      );
    }
    if (targetType === "ASSIGNMENT") {
      const assignment = await this.prisma.assignment.findFirst({
        where: {
          id: targetId,
          OR: [
            { worker_user_id: reporterUserId },
            { job: { poster_user_id: reporterUserId } },
          ],
        },
        include: { job: { select: { poster_user_id: true } } },
      });
      if (!assignment) throw new NotFoundException();
      return assignment.worker_user_id === reporterUserId
        ? assignment.job.poster_user_id
        : assignment.worker_user_id;
    }
    const message = await this.prisma.message.findFirst({
      where: {
        id: targetId,
        deleted_at: null,
        conversation: {
          participants: { some: { user_id: reporterUserId } },
        },
      },
      select: { sender_user_id: true },
    });
    if (!message?.sender_user_id) throw new NotFoundException();
    return message.sender_user_id;
  }

  private audit(
    actor: AdminActor,
    action: string,
    entity: string,
    entityId: string | null,
    after: Prisma.InputJsonValue,
    context: AdminRequestContext,
  ) {
    return this.prisma.auditLog.create({
      data: this.auditData(
        actor,
        action,
        entity,
        entityId,
        null,
        after,
        context,
      ),
    });
  }

  private auditData(
    actor: AdminActor,
    action: string,
    entity: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actor_user_id: actor.userId,
      action,
      entity,
      entity_id: entityId,
      before_json: before ?? Prisma.JsonNull,
      after_json: after ?? Prisma.JsonNull,
      ip: context.ip,
      ua: context.ua,
    };
  }
}

function effectiveLevel(user: {
  moderation_level: ModerationLevel;
  status: UserStatus;
}) {
  if (user.status === UserStatus.BANNED) return ModerationLevel.BAN;
  if (user.status === UserStatus.SUSPENDED) return ModerationLevel.SUSPEND;
  return user.moderation_level;
}

function statusForLevel(level: ModerationLevel): UserStatus {
  if (level === ModerationLevel.SUSPEND) return UserStatus.SUSPENDED;
  if (level === ModerationLevel.BAN) return UserStatus.BANNED;
  return UserStatus.ACTIVE;
}
