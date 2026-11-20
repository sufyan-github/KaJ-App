import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { JobActorType, JobStatus, MentorStatus, Prisma } from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import { NotificationsService } from "../notifications/notifications.service";
import { JobStateMachine } from "../jobs/state-machine/job-state.machine";
import {
  AdminCertificateQueryDto,
  AdminOpportunityQueryDto,
  AdminReasonDto,
} from "./dto/learning-admin.dto";
import { termsText } from "./learning-terms";
import { LEARNING_ONLY } from "./learning.service";

/** Admin operations for KAAJ Learn; every change is audit-logged. */
@Injectable()
export class LearningAdminService {
  private readonly states = new JobStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Learning opportunities for moderation, newest first. */
  async opportunities(query: AdminOpportunityQueryDto) {
    const limit = query.limit ?? 50;
    const status = Object.values(JobStatus).includes(query.status as JobStatus)
      ? (query.status as JobStatus)
      : undefined;
    const rows = await this.prisma.job.findMany({
      where: {
        ...LEARNING_ONLY,
        deleted_at: null,
        ...(status ? { status } : {}),
        ...(query.search
          ? { title: { contains: query.search, mode: "insensitive" } }
          : {}),
      },
      include: {
        poster: {
          select: {
            id: true,
            profile: { select: { display_name: true, mentor_status: true } },
          },
        },
        _count: { select: { applications: true, assignments: true } },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((row) => ({
        id: row.id,
        title: row.title,
        opportunityType: row.opportunity_type,
        status: row.status,
        terms: row.participant_terms,
        termsText: termsText({
          terms: row.participant_terms!,
          feePoisha: row.participant_fee_poisha,
          stipendPoisha:
            row.participant_terms === "STIPEND" ? row.budget_min_poisha : null,
        }),
        seats: row.workers_required,
        seatsFilled: row.workers_filled,
        applications: row._count.applications,
        enrolments: row._count.assignments,
        mentor: {
          userId: row.poster.id,
          name: row.poster.profile?.display_name ?? "Unknown",
          mentorStatus: row.poster.profile?.mentor_status ?? MentorStatus.NONE,
        },
        createdAt: row.created_at.toISOString(),
        // What the console offers: suspend, or restore a suspended one.
        actions: row.status === JobStatus.SUSPENDED ? ["restore"] : ["suspend"],
      })),
    };
  }

  /** Hide a learning opportunity (e.g. a report), through the job rules. */
  async suspendOpportunity(
    id: string,
    input: AdminReasonDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    return this.moderateOpportunity(id, "suspend", input, actor, context);
  }

  /** Put a suspended opportunity back where it was. */
  async restoreOpportunity(
    id: string,
    input: AdminReasonDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    return this.moderateOpportunity(id, "restore", input, actor, context);
  }

  private async moderateOpportunity(
    id: string,
    action: "suspend" | "restore",
    input: AdminReasonDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const job = await this.prisma.job.findFirst({
      where: { ...LEARNING_ONLY, id, deleted_at: null },
    });
    if (!job) throw new NotFoundException();
    let target: JobStatus = JobStatus.SUSPENDED;
    let suspendedFrom: JobStatus | null = null;
    if (action === "restore") {
      if (job.status !== JobStatus.SUSPENDED)
        throw new ConflictException(
          "Only a suspended opportunity can be restored.",
        );
      const last = await this.prisma.jobStatusHistory.findFirst({
        where: { job_id: id, to_status: JobStatus.SUSPENDED },
        orderBy: { created_at: "desc" },
      });
      suspendedFrom = last?.from_status ?? null;
      if (!suspendedFrom || suspendedFrom === JobStatus.SUSPENDED)
        throw new ConflictException("The status before suspension is unknown.");
      target = suspendedFrom;
    } else if (job.status === JobStatus.SUSPENDED) {
      throw new ConflictException("This opportunity is already suspended.");
    }
    const reason = input.reason.trim();
    await this.prisma.$transaction(async (transaction) => {
      await this.states.transitionInTransaction(
        transaction,
        job,
        target,
        { type: JobActorType.ADMIN, userId: actor.userId },
        reason,
        { suspendedFrom },
      );
      await transaction.auditLog.create({
        data: audit(
          actor,
          context,
          action === "suspend"
            ? "ADMIN_LEARNING_SUSPENDED"
            : "ADMIN_LEARNING_RESTORED",
          "JOB",
          id,
          { status: job.status },
          { status: target, reason },
        ),
      });
    });
    await this.notifications?.create({
      userId: job.poster_user_id,
      type: action === "suspend" ? "LEARNING_SUSPENDED" : "LEARNING_RESTORED",
      title:
        action === "suspend" ? "শেখার সুযোগ স্থগিত" : "শেখার সুযোগ আবার চালু",
      body:
        action === "suspend"
          ? `${job.title} — KAAJ পর্যালোচনার জন্য এটি সাময়িকভাবে লুকানো হয়েছে।`
          : `${job.title} — আবার দেখা যাচ্ছে।`,
      payload: { route: `/learn/opportunities/${id}`, opportunityId: id },
      dedupeKey: `learning-${action}:${id}:${Date.now()}`,
    });
    return { id, status: target };
  }

  /** Suspend or reinstate an approved mentor (stops new publishing). */
  async setMentorSuspended(
    userId: string,
    suspended: boolean,
    input: AdminReasonDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { user_id: userId },
      select: { mentor_status: true },
    });
    const expected = suspended ? MentorStatus.APPROVED : MentorStatus.SUSPENDED;
    if (!profile || profile.mentor_status !== expected)
      throw new ConflictException(
        suspended
          ? "Only an approved mentor can be suspended."
          : "Only a suspended mentor can be reinstated.",
      );
    const next = suspended ? MentorStatus.SUSPENDED : MentorStatus.APPROVED;
    const reason = input.reason.trim();
    await this.prisma.$transaction([
      this.prisma.profile.update({
        where: { user_id: userId },
        data: {
          mentor_status: next,
          ...(suspended ? { mentor_accepting: false } : {}),
        },
      }),
      this.prisma.auditLog.create({
        data: audit(
          actor,
          context,
          suspended ? "ADMIN_MENTOR_SUSPENDED" : "ADMIN_MENTOR_REINSTATED",
          "USER",
          userId,
          { mentorStatus: profile.mentor_status },
          { mentorStatus: next, reason },
        ),
      }),
    ]);
    // W7: the mentor is told (their opportunities leave the feed while
    // suspended and take no applications).
    await this.notifications?.create({
      userId,
      type: suspended ? "MENTOR_SUSPENDED" : "MENTOR_REINSTATED",
      title: suspended ? "মেন্টর হিসেবে স্থগিত" : "মেন্টর হিসেবে আবার চালু",
      body: suspended
        ? "KAAJ পর্যালোচনা চলাকালীন আপনার শেখার সুযোগগুলো লুকানো থাকবে এবং নতুন আবেদন নেওয়া হবে না।"
        : "আপনার শেখার সুযোগগুলো আবার দেখা যাচ্ছে।",
      payload: { route: "/learn/mentor" },
      dedupeKey: `mentor-${suspended ? "suspended" : "reinstated"}:${userId}:${Date.now()}`,
    });
    return { userId, mentorStatus: next };
  }

  /** A user's learning, for the admin user view: enrolments and progress. */
  async userLearning(userId: string) {
    const [profile, enrolments, certificates] = await Promise.all([
      this.prisma.profile.findUnique({
        where: { user_id: userId },
        select: { mentor_status: true, mentor_accepting: true },
      }),
      this.prisma.assignment.findMany({
        where: {
          job: LEARNING_ONLY,
          OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
        },
        include: {
          job: { select: { id: true, title: true, poster_user_id: true } },
          learning_sessions: {
            select: { minutes: true, learner_confirmed_at: true },
          },
          completion_record: {
            select: { public_code: true, revoked_at: true },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 100,
      }),
      this.prisma.trainingCertificate.count({
        where: { user_id: userId, revoked_at: null },
      }),
    ]);
    return {
      mentorStatus: profile?.mentor_status ?? MentorStatus.NONE,
      mentorAccepting: profile?.mentor_accepting ?? false,
      validCertificates: certificates,
      enrolments: enrolments.map((row) => ({
        id: row.id,
        role: row.job.poster_user_id === userId ? "MENTOR" : "LEARNER",
        opportunity: { id: row.job.id, title: row.job.title },
        status: row.status,
        progress: {
          sessionsRecorded: row.learning_sessions.length,
          sessionsConfirmed: row.learning_sessions.filter(
            (item) => item.learner_confirmed_at,
          ).length,
          minutesTotal: row.learning_sessions.reduce(
            (sum, item) => sum + item.minutes,
            0,
          ),
        },
        completionCode: row.completion_record?.public_code ?? null,
        completionRevoked: Boolean(row.completion_record?.revoked_at),
      })),
    };
  }

  async certificates(query: AdminCertificateQueryDto) {
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const where: Prisma.TrainingCertificateWhereInput = {
      ...(query.kind === "PRACTICAL" ? { assignment_id: { not: null } } : {}),
      ...(query.kind === "QUIZ" ? { attempt_id: { not: null } } : {}),
      ...(search
        ? {
            OR: [
              { public_code: { contains: search.toUpperCase() } },
              {
                user: {
                  profile: {
                    display_name: { contains: search, mode: "insensitive" },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.trainingCertificate.findMany({
      where,
      include: {
        course: { select: { title_en: true, title_bn: true } },
        user: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
        issued_by: {
          select: { id: true, profile: { select: { display_name: true } } },
        },
      },
      orderBy: [{ issued_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: page.items.map((row) => ({
        id: row.id,
        kind: row.assignment_id ? "PRACTICAL" : "QUIZ",
        code: row.public_code,
        title: row.title ?? row.course?.title_en ?? null,
        holder: {
          userId: row.user.id,
          name: row.user.profile?.display_name ?? "Unknown",
        },
        issuedBy: row.issued_by
          ? {
              userId: row.issued_by.id,
              name: row.issued_by.profile?.display_name ?? "Unknown",
            }
          : null,
        evidenceLevel: row.evidence_level,
        issuedAt: row.issued_at.toISOString(),
        status: row.revoked_at ? "REVOKED" : "VALID",
        revokedReason: row.revoked_reason,
      })),
    };
  }

  async revokeCertificate(
    id: string,
    input: AdminReasonDto,
    actor: AdminActor,
    context: AdminRequestContext,
  ) {
    const certificate = await this.prisma.trainingCertificate.findUnique({
      where: { id },
    });
    if (!certificate) throw new NotFoundException();
    if (certificate.revoked_at)
      throw new ConflictException("This record is already revoked.");
    const now = new Date();
    const reason = input.reason.trim();
    await this.prisma.$transaction([
      this.prisma.trainingCertificate.update({
        where: { id },
        data: { revoked_at: now, revoked_reason: reason },
      }),
      this.prisma.auditLog.create({
        data: audit(
          actor,
          context,
          "ADMIN_CERTIFICATE_REVOKED",
          "CERTIFICATE",
          id,
          {
            status: "VALID",
          },
          { status: "REVOKED", reason },
        ),
      }),
    ]);
    await this.notifications?.create({
      userId: certificate.user_id,
      type: "CERTIFICATE_REVOKED",
      title: "সনদ বাতিল হয়েছে",
      body: "আপনার একটি সনদ KAAJ বাতিল করেছে। বিস্তারিত জানতে সহায়তায় যোগাযোগ করুন।",
      payload: { certificateId: id },
      dedupeKey: `certificate-revoked:${id}`,
    });
    return { id, status: "REVOKED", revokedAt: now.toISOString() };
  }
}

export function audit(
  actor: AdminActor,
  context: AdminRequestContext,
  action: string,
  entity: string,
  entityId: string | null,
  before: Prisma.InputJsonValue | null,
  after: Prisma.InputJsonValue | null,
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
