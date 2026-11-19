import { EngagementService } from "../safety/engagement.service";
import { visibleDisplayName } from "../users/public-profile.projection";
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
import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { ideaRelation, isTeam } from "../ideas/idea-visibility";
import {
  ContentTargetType,
  describeContent,
  isContentTarget,
  setContentHidden,
} from "./content-moderation";
import { UserBlocksService } from "../safety/user-blocks.service";
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
  FIRST_ACTION_MINUTES,
  REPORT_PRIORITY,
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
          priority: REPORT_PRIORITY[input.reasonCode] ?? 0,
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
          include: {
            profile: { select: { display_name: true, show_full_name: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });
    // One name rule (R1): masked unless shown by choice or hired before.
    const hiredWith = await new EngagementService(this.prisma).hiredWith(
      userId,
      items.map((item) => item.blocked_user_id),
    );
    return {
      items: items.map((item) => ({
        userId: item.blocked_user_id,
        displayName:
          visibleDisplayName(item.blocked.profile?.display_name ?? "", {
            showFullName: item.blocked.profile?.show_full_name ?? false,
            hired: hiredWith.has(item.blocked_user_id),
          }) || "KAAJ user",
        blockedAt: item.created_at.toISOString(),
      })),
    };
  }

  async queue(
    query: ReportQueueQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    // Actionable by default, so decided reports can't push new ones out.
    const where: Prisma.ReportWhereInput = {
      ...(query.status
        ? { status: query.status }
        : { status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] } }),
      ...(query.minPriority !== undefined
        ? { priority: { gte: query.minPriority } }
        : {}),
    };
    const [page, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        // P3.7: the priority safety queue: higher priority first, then oldest.
        orderBy: [{ priority: "desc" }, { created_at: "asc" }, { id: "asc" }],
        ...pageArgs(query),
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
    const { items, nextCursor } = pageResult(page, query.limit);
    // P2 targets: what was reported, and whether it is hidden now.
    const contents = await Promise.all(
      items.map((item) =>
        isContentTarget(item.target_type)
          ? describeContent(this.prisma, item.target_type, item.target_id)
          : Promise.resolve(null),
      ),
    );
    return {
      total,
      nextCursor,
      items: items.map((item, index) => ({
        id: item.id,
        targetType: item.target_type,
        targetId: item.target_id,
        content: contents[index] ?? null,
        ...firstAction(item, this.clock.now()),
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
          first_action_at: this.clock.now(),
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
    const result = await this.decideReport(reportId, input, actor, context);
    await this.markFirstAction(reportId);
    return result;
  }

  /** P3.7: time-to-first-action — set once, by the first review or decision. */
  private markFirstAction(reportId: string) {
    return this.prisma.report.updateMany({
      where: { id: reportId, first_action_at: null },
      data: { first_action_at: this.clock.now() },
    });
  }

  private async decideReport(
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
    if (input.hideContent && !isContentTarget(report.target_type))
      throw new BadRequestException(
        "Only businesses, offerings, ideas, idea roles and collaboration requests can be hidden.",
      );
    const level =
      input.action && input.action !== ModerationLevel.NONE
        ? input.action
        : null;
    if (input.hideContent && isContentTarget(report.target_type)) {
      await this.setContentHidden(
        report.target_type,
        report.target_id,
        true,
        input.reason,
        actor,
        context,
        { report, closeReport: !level },
      );
      if (!level)
        return {
          id: reportId,
          status: ReportStatus.ACTIONED,
          contentHidden: true,
        };
    }
    if (!level) {
      throw new BadRequestException(
        "An actioned report requires a moderation level or hideContent.",
      );
    }
    if (!report.subject_user_id) {
      throw new ConflictException("The report has no actionable user subject.");
    }
    return this.applyLevel(
      report.subject_user_id,
      {
        action: level,
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
    if (targetType === "IDEA" || targetType === "IDEA_ROLE") {
      // Only what the reporter may see can be reported; otherwise 404, the
      // same answer as every other idea endpoint.
      const ideaId =
        targetType === "IDEA"
          ? targetId
          : (
              await this.prisma.ideaRole.findUnique({
                where: { id: targetId },
                select: { idea_id: true, status: true, hidden_at: true },
              })
            )?.idea_id;
      const relation = ideaId
        ? await ideaRelation(this.prisma, reporterUserId, ideaId)
        : null;
      if (!ideaId || !relation) throw new NotFoundException();
      if (targetType === "IDEA_ROLE" && !isTeam(relation)) {
        const role = await this.prisma.ideaRole.findUniqueOrThrow({
          where: { id: targetId },
          select: { status: true, hidden_at: true },
        });
        if (role.status !== "OPEN" || role.hidden_at)
          throw new NotFoundException();
      }
      const idea = await this.prisma.businessIdea.findUniqueOrThrow({
        where: { id: ideaId },
        select: { owner_user_id: true },
      });
      return idea.owner_user_id;
    }
    if (targetType === "BUSINESS" || targetType === "BUSINESS_OFFERING") {
      const businessId =
        targetType === "BUSINESS"
          ? targetId
          : (
              await this.prisma.businessOffering.findFirst({
                where: {
                  id: targetId,
                  deleted_at: null,
                  is_active: true,
                  hidden_at: null,
                },
                select: { business_profile_id: true },
              })
            )?.business_profile_id;
      const business = businessId
        ? await this.prisma.businessProfile.findFirst({
            where: { id: businessId, deleted_at: null },
            include: {
              members: {
                where: { accepted_at: { not: null } },
                orderBy: [{ created_at: "asc" }, { id: "asc" }],
                select: { user_id: true, role: true },
              },
            },
          })
        : null;
      if (!business) throw new NotFoundException();
      const member = business.members.some(
        (item) => item.user_id === reporterUserId,
      );
      const owners = business.members.filter((item) => item.role === "OWNER");
      if (!member) {
        if (!business.is_public || business.suspended_at)
          throw new NotFoundException();
        const hidden = new Set(
          await new UserBlocksService(this.prisma).hiddenFrom(reporterUserId),
        );
        if (owners.some((owner) => hidden.has(owner.user_id)))
          throw new NotFoundException();
      }
      return owners[0]?.user_id ?? business.user_id;
    }
    if (targetType === "GROUP") {
      // Public groups, or ones the reporter belongs to (private: 404 otherwise).
      const group = await this.prisma.communityGroup.findFirst({
        where: {
          id: targetId,
          deleted_at: null,
          hidden_at: null,
          OR: [
            { visibility: "PUBLIC" },
            {
              members: {
                some: { user_id: reporterUserId, status: "ACTIVE" },
              },
            },
          ],
        },
        select: { created_by_user_id: true },
      });
      if (!group) throw new NotFoundException();
      return group.created_by_user_id;
    }
    if (targetType === "SESSION") {
      const session = await this.prisma.session.findFirst({
        where: {
          id: targetId,
          hidden_at: null,
          OR: [
            { host_user_id: reporterUserId },
            { participants: { some: { user_id: reporterUserId } } },
          ],
        },
        select: { host_user_id: true },
      });
      if (!session) throw new NotFoundException();
      return session.host_user_id;
    }
    if (targetType === "INTRODUCTION") {
      const introduction = await this.prisma.introductionRequest.findFirst({
        where: {
          id: targetId,
          OR: [
            { requester_user_id: reporterUserId },
            { target_user_id: reporterUserId },
          ],
        },
        select: { requester_user_id: true, target_user_id: true },
      });
      if (!introduction) throw new NotFoundException();
      return introduction.requester_user_id === reporterUserId
        ? introduction.target_user_id
        : introduction.requester_user_id;
    }
    if (targetType === "COLLABORATION_REQUEST") {
      const request = await this.prisma.collaborationRequest.findFirst({
        where: {
          id: targetId,
          OR: [
            { requester_user_id: reporterUserId },
            { recipient_user_id: reporterUserId },
          ],
        },
        select: { requester_user_id: true, recipient_user_id: true },
      });
      if (!request) throw new NotFoundException();
      return request.requester_user_id === reporterUserId
        ? request.recipient_user_id
        : request.requester_user_id;
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

  /**
   * P2: hide or restore reported content (a business is suspended). Logged
   * as a moderation action and audited; the owner is told. With
   * `closeReport`, the report becomes ACTIONED in the same transaction.
   */
  async setContentHidden(
    type: ContentTargetType,
    id: string,
    hidden: boolean,
    reason: string,
    actor: AdminActor,
    context: AdminRequestContext,
    options: {
      report?: { id: string; status: ReportStatus };
      closeReport?: boolean;
    } = {},
  ) {
    const now = this.clock.now();
    await this.prisma.$transaction(async (transaction) => {
      const target = await setContentHidden(
        transaction,
        type,
        id,
        hidden,
        reason.trim(),
      );
      if (options.report && options.closeReport) {
        const decided = await transaction.report.updateMany({
          where: {
            id: options.report.id,
            status: { in: [ReportStatus.OPEN, ReportStatus.UNDER_REVIEW] },
          },
          data: {
            status: ReportStatus.ACTIONED,
            reviewer_user_id: actor.userId,
            resolution: reason.trim(),
            reviewed_at: now,
          },
        });
        if (decided.count !== 1)
          throw new ConflictException("This report already has a decision.");
      }
      await transaction.moderationAction.create({
        data: {
          admin_user_id: actor.userId,
          report_id: options.report?.id ?? null,
          target_type: type,
          target_id: id,
          action: hidden ? "HIDE_CONTENT" : "RESTORE_CONTENT",
          reason: reason.trim(),
          created_at: now,
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          hidden ? "ADMIN_CONTENT_HIDDEN" : "ADMIN_CONTENT_RESTORED",
          type,
          id,
          null,
          { reason: reason.trim(), reportId: options.report?.id ?? null },
          context,
        ),
      });
      if (target.ownerUserId)
        await transaction.notification.create({
          data: {
            user_id: target.ownerUserId,
            type: hidden ? "CONTENT_HIDDEN" : "CONTENT_RESTORED",
            title_key: hidden
              ? "moderation.content_hidden.title"
              : "moderation.content_restored.title",
            body_key: hidden
              ? "moderation.content_hidden.body"
              : "moderation.content_restored.body",
            payload_json: {
              targetType: type,
              targetId: id,
              title: target.title,
              reason: hidden ? reason.trim() : null,
            },
          },
        });
    });
    if (options.report) await this.markFirstAction(options.report.id);
    return { targetType: type, targetId: id, hidden };
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

/**
 * P3.7: triage facts for the queue: priority, how long it has waited, when
 * staff should first act (by priority) and how long the first action took.
 */
function firstAction(
  report: { priority: number; created_at: Date; first_action_at: Date | null },
  now: Date,
) {
  const dueMinutes =
    FIRST_ACTION_MINUTES[report.priority] ?? FIRST_ACTION_MINUTES[0]!;
  const dueAt = new Date(report.created_at.getTime() + dueMinutes * 60_000);
  return {
    priority: report.priority,
    ageMinutes: Math.floor(
      (now.getTime() - report.created_at.getTime()) / 60_000,
    ),
    firstActionDueAt: dueAt.toISOString(),
    firstActionAt: report.first_action_at?.toISOString() ?? null,
    timeToFirstActionMinutes: report.first_action_at
      ? Math.floor(
          (report.first_action_at.getTime() - report.created_at.getTime()) /
            60_000,
        )
      : null,
    overdue: report.first_action_at
      ? report.first_action_at > dueAt
      : now > dueAt,
  };
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
