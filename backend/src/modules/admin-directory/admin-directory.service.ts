import { Inject, Injectable } from "@nestjs/common";
import {
  AssignmentStatus,
  IdeaVisibility,
  JobStatus,
  MentorStatus,
  Prisma,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { CLOCK, Clock } from "../../common/time/clock";
import { LEARNING_ONLY } from "../learning/learning.service";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import {
  AttendanceListQueryDto,
  ContentListQueryDto,
  IntroductionListQueryDto,
  MentorListQueryDto,
} from "./dto/admin-directory.dto";

const NEWEST = [{ created_at: "desc" }, { id: "desc" }] as const;
const contains = (search: string) =>
  ({ contains: search, mode: "insensitive" }) as const;

/**
 * Read-only lists for moderation and support (R5): businesses, ideas,
 * introductions, mentors and attendance. Actions use the existing routes
 * (content hide/restore, mentor suspend/reinstate, attendance overrides).
 * No phone numbers or private message text are returned.
 */
@Injectable()
export class AdminDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async businesses(
    query: ContentListQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.BusinessProfileWhereInput = {
      deleted_at: null,
      ...(query.state === "hidden" ? { suspended_at: { not: null } } : {}),
      ...(query.state === "visible" ? { suspended_at: null } : {}),
      ...(query.search
        ? {
            OR: [
              { business_name: contains(query.search) },
              { trade_licence_no: contains(query.search) },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.businessProfile.findMany({
      where,
      orderBy: [...NEWEST],
      include: {
        user: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        location: { select: { name_en: true, name_bn: true } },
        _count: { select: { offerings: true } },
      },
      ...pageArgs(query),
    });
    await this.audit(
      actor,
      "ADMIN_BUSINESSES_VIEWED",
      "BUSINESS",
      query,
      context,
    );
    return pageResult(
      rows.map((row) => ({
        id: row.id,
        name: row.business_name,
        owner: {
          userId: row.user.id,
          name: row.user.profile?.display_name ?? null,
        },
        stage: row.stage,
        verificationStatus: row.verification_status,
        isPublic: row.is_public,
        location: row.location
          ? { nameEn: row.location.name_en, nameBn: row.location.name_bn }
          : null,
        offerings: row._count.offerings,
        hidden: !!row.suspended_at,
        hiddenReason: row.suspension_reason,
        createdAt: row.created_at,
      })),
      query.limit,
    );
  }

  /**
   * Shared and public ideas, plus any idea moderation already hid. Private
   * ideas stay private: staff see them only through a report.
   */
  async ideas(
    query: ContentListQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.BusinessIdeaWhereInput = {
      deleted_at: null,
      OR: [
        { visibility: { not: IdeaVisibility.PRIVATE } },
        { hidden_at: { not: null } },
      ],
      ...(query.state === "hidden" ? { hidden_at: { not: null } } : {}),
      ...(query.state === "visible" ? { hidden_at: null } : {}),
      ...(query.search
        ? {
            AND: [
              {
                OR: [
                  { title: contains(query.search) },
                  { summary: contains(query.search) },
                ],
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.businessIdea.findMany({
      where,
      orderBy: [...NEWEST],
      include: {
        owner: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
      },
      ...pageArgs(query),
    });
    await this.audit(actor, "ADMIN_IDEAS_VIEWED", "IDEA", query, context);
    return pageResult(
      rows.map((row) => ({
        id: row.id,
        title: row.title,
        summary: row.summary,
        owner: {
          userId: row.owner.id,
          name: row.owner.profile?.display_name ?? null,
        },
        stage: row.stage,
        visibility: row.visibility,
        hidden: !!row.hidden_at,
        hiddenReason: row.hidden_reason,
        createdAt: row.created_at,
      })),
      query.limit,
    );
  }

  /**
   * Introduction requests without their message text, with how many the
   * requester sent in the last 7 days (to spot one person sending many).
   */
  async introductions(
    query: IntroductionListQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.IntroductionRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.state === "hidden" ? { hidden_at: { not: null } } : {}),
      ...(query.state === "visible" ? { hidden_at: null } : {}),
      ...(query.search
        ? {
            OR: [
              {
                requester: {
                  profile: { display_name: contains(query.search) },
                },
              },
              { target: { profile: { display_name: contains(query.search) } } },
            ],
          }
        : {}),
    };
    const person = {
      select: { id: true, profile: { select: { display_name: true } } },
    } as const;
    const rows = await this.prisma.introductionRequest.findMany({
      where,
      orderBy: [...NEWEST],
      include: { requester: person, target: person },
      ...pageArgs(query),
    });
    const since = new Date(this.clock.now().getTime() - 7 * 86_400_000);
    const volume = await this.prisma.introductionRequest.groupBy({
      by: ["requester_user_id"],
      where: {
        requester_user_id: {
          in: [...new Set(rows.map((r) => r.requester_user_id))],
        },
        created_at: { gte: since },
      },
      _count: { _all: true },
    });
    const sentBy = new Map(
      volume.map((row) => [row.requester_user_id, row._count._all]),
    );
    await this.audit(
      actor,
      "ADMIN_INTRODUCTIONS_VIEWED",
      "INTRODUCTION",
      query,
      context,
    );
    return pageResult(
      rows.map((row) => ({
        id: row.id,
        requester: {
          userId: row.requester.id,
          name: row.requester.profile?.display_name ?? null,
          sentLast7Days: sentBy.get(row.requester_user_id) ?? 0,
        },
        target: {
          userId: row.target.id,
          name: row.target.profile?.display_name ?? null,
        },
        contextType: row.context_type,
        contextSummary: row.context_summary,
        status: row.status,
        hidden: !!row.hidden_at,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      })),
      query.limit,
    );
  }

  /** Mentors by capability status, including ones with no opportunity. */
  async mentors(
    query: MentorListQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const where: Prisma.ProfileWhereInput = {
      deleted_at: null,
      mentor_status: query.status ?? { not: MentorStatus.NONE },
      ...(query.search ? { display_name: contains(query.search) } : {}),
    };
    const rows = await this.prisma.profile.findMany({
      where,
      orderBy: [{ mentor_applied_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        user_id: true,
        display_name: true,
        mentor_status: true,
        mentor_accepting: true,
        mentor_years_experience: true,
        mentor_applied_at: true,
        mentor_approved_at: true,
      },
      ...pageArgs(query),
    });
    // Learning opportunities are jobs posted by the mentor.
    const opportunities = await this.prisma.job.groupBy({
      by: ["poster_user_id"],
      where: {
        ...LEARNING_ONLY,
        deleted_at: null,
        poster_user_id: { in: rows.map((row) => row.user_id) },
      },
      _count: { _all: true },
    });
    const countBy = new Map(
      opportunities.map((row) => [row.poster_user_id, row._count._all]),
    );
    await this.audit(actor, "ADMIN_MENTORS_VIEWED", "MENTOR", query, context);
    return pageResult(
      rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        name: row.display_name,
        status: row.mentor_status,
        accepting: row.mentor_accepting,
        yearsExperience: row.mentor_years_experience,
        appliedAt: row.mentor_applied_at,
        approvedAt: row.mentor_approved_at,
        opportunities: countBy.get(row.user_id) ?? 0,
      })),
      query.limit,
    );
  }

  /**
   * Confirmed assignments on live jobs with their check-in/out state, for
   * the check-in and check-out overrides.
   */
  async attendance(
    query: AttendanceListQueryDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const now = this.clock.now();
    const where: Prisma.AssignmentWhereInput = {
      status: AssignmentStatus.CONFIRMED,
      job: {
        status: {
          in: [JobStatus.CONFIRMED, JobStatus.UPCOMING, JobStatus.IN_PROGRESS],
        },
        ...(query.search ? { title: contains(query.search) } : {}),
      },
      ...(query.state === "needs-checkin"
        ? {
            agreed_starts_at: { lte: now },
            work_sessions: { none: { checkin_at: { not: null } } },
          }
        : {}),
      ...(query.state === "needs-checkout"
        ? {
            agreed_ends_at: { lte: now },
            work_sessions: {
              some: { checkin_at: { not: null }, checkout_at: null },
            },
          }
        : {}),
    };
    const rows = await this.prisma.assignment.findMany({
      where,
      orderBy: [{ agreed_starts_at: "asc" }, { id: "asc" }],
      include: {
        job: { select: { id: true, title: true, status: true } },
        worker: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        work_sessions: {
          select: {
            checkin_at: true,
            checkout_at: true,
            overridden_at: true,
            override_reason: true,
          },
        },
      },
      ...pageArgs(query),
    });
    await this.audit(
      actor,
      "ADMIN_ATTENDANCE_VIEWED",
      "ASSIGNMENT",
      query,
      context,
    );
    return pageResult(
      rows.map((row) => {
        const session = row.work_sessions[0];
        return {
          id: row.id,
          job: { id: row.job.id, title: row.job.title, status: row.job.status },
          worker: {
            userId: row.worker.id,
            name: row.worker.profile?.display_name ?? null,
          },
          startsAt: row.agreed_starts_at,
          endsAt: row.agreed_ends_at,
          checkinAt: session?.checkin_at ?? null,
          checkoutAt: session?.checkout_at ?? null,
          overriddenAt: session?.overridden_at ?? null,
          overrideReason: session?.override_reason ?? null,
        };
      }),
      query.limit,
    );
  }

  private async audit(
    actor: AdminActor,
    action: string,
    entity: string,
    query: object,
    context: AdminRequestContext,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actor_user_id: actor.userId,
        action,
        entity,
        entity_id: null,
        before_json: Prisma.JsonNull,
        after_json: { filters: JSON.parse(JSON.stringify(query)) },
        ip: context.ip,
        ua: context.ua,
      },
    });
  }
}
