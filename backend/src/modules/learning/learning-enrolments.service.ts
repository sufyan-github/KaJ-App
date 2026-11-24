import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  ApplicationStatus,
  AssignmentStatus,
  EvidenceLevel,
  ParticipantTerms,
  Prisma,
  WorkArrangement,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { MentorsService } from "../mentors/mentors.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import { generateUniqueCertificateCode } from "../training/training.rules";
import {
  RecordLearningSessionDto,
  WithdrawLearningDto,
} from "./dto/learning.dto";
import { termsText } from "./learning-terms";
import { LEARNING_ONLY } from "./learning.service";
import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { CursorQueryDto } from "../../common/api/cursor-query.dto";

/** How a learning opportunity is delivered, as the learner reads it. */
const DELIVERY_MODE: Record<
  WorkArrangement,
  { code: string; en: string; bn: string }
> = {
  ON_SITE: { code: "IN_PERSON", en: "In person", bn: "সরাসরি উপস্থিত হয়ে" },
  HOME_BASED: { code: "AT_HOME", en: "From home", bn: "বাড়ি থেকে" },
  REMOTE: { code: "ONLINE", en: "Online", bn: "অনলাইনে" },
  HYBRID: {
    code: "HYBRID",
    en: "In person and online",
    bn: "সরাসরি ও অনলাইনে",
  },
};

const enrolmentInclude = {
  job: {
    include: {
      location: { select: { id: true, name_en: true, name_bn: true } },
    },
  },
  contracts: { orderBy: { version: "desc" }, take: 1 },
  learning_sessions: { orderBy: [{ held_at: "asc" }, { id: "asc" }] },
  completion_record: {
    select: {
      id: true,
      public_code: true,
      issued_at: true,
      revoked_at: true,
      evidence_level: true,
    },
  },
  worker: {
    select: {
      id: true,
      profile: { select: { display_name: true, show_full_name: true } },
    },
  },
} satisfies Prisma.AssignmentInclude;

/**
 * P1.3: the mentor accepts or declines learners; acceptance enrols the
 * learner (an assignment) with a contract snapshot of the terms, schedule
 * and delivery mode; taught sessions are recorded as progress.
 */
@Injectable()
export class LearningEnrolmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mentors: MentorsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  /** The mentor's applicant list (people in a block with them hidden). */
  async applications(mentorUserId: string, opportunityId: string) {
    await this.ownedOpportunity(mentorUserId, opportunityId);
    const hidden = await this.blocks.hiddenFrom(mentorUserId);
    const rows = await this.prisma.application.findMany({
      where: { job_id: opportunityId, worker_user_id: { notIn: hidden } },
      include: {
        worker: {
          select: {
            id: true,
            profile: {
              select: {
                display_name: true,
                show_full_name: true,
                trust_level: true,
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        message: row.message,
        appliedAt: row.created_at.toISOString(),
        learner: {
          userId: row.worker.id,
          displayName: visibleDisplayName(
            row.worker.profile?.display_name ?? "",
            {
              showFullName: row.worker.profile?.show_full_name ?? false,
              hired: false,
            },
          ),
          trustLevel: row.worker.profile?.trust_level ?? "NONE",
        },
      })),
    };
  }

  async accept(mentorUserId: string, applicationId: string) {
    await this.mentors.assertApproved(mentorUserId);
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (
      !application ||
      application.job.poster_user_id !== mentorUserId ||
      application.job.opportunity_type === "WORK"
    )
      throw new NotFoundException();
    if (application.status !== ApplicationStatus.PENDING)
      throw new ConflictException("Application is no longer pending.");
    await this.blocks.assertNotBlocked(
      mentorUserId,
      application.worker_user_id,
    );
    const job = application.job;
    const now = new Date();
    const fee = job.participant_fee_poisha;
    const stipend =
      job.participant_terms === ParticipantTerms.STIPEND
        ? job.budget_min_poisha
        : null;

    const assignmentId = await this.prisma.$transaction(async (transaction) => {
      // Seats are taken race-safely: only while one is still free.
      const seat = await transaction.$executeRaw`
        UPDATE jobs SET workers_filled = workers_filled + 1
        WHERE id = ${job.id}::uuid AND workers_filled < workers_required`;
      if (seat !== 1)
        throw new ConflictException({
          code: "SEATS_FULL",
          message: "Every seat is taken.",
          messageKey: "error.learning.seats_full",
        });
      const updated = await transaction.application.updateMany({
        where: { id: applicationId, status: ApplicationStatus.PENDING },
        data: { status: ApplicationStatus.ACCEPTED },
      });
      if (updated.count !== 1)
        throw new ConflictException("Application is no longer pending.");
      const assignment = await transaction.assignment.create({
        data: {
          job_id: job.id,
          application_id: applicationId,
          worker_user_id: application.worker_user_id,
          // What changes hands between the two (no platform fee on Learn).
          agreed_price_poisha: fee ?? stipend ?? 0n,
          agreed_starts_at: job.starts_at,
          agreed_ends_at: job.ends_at,
          status: AssignmentStatus.CONFIRMED,
          confirmed_at: now,
        },
      });
      const terms = job.participant_terms!;
      await transaction.contract.create({
        data: {
          assignment_id: assignment.id,
          version: 1,
          platform_fee_poisha: 0n,
          worker_earning_poisha: stipend ?? 0n,
          cancellation_policy_json: {},
          snapshot_json: {
            kind: "LEARNING",
            opportunityType: job.opportunity_type,
            title: job.title,
            terms,
            termsText: termsText({
              terms,
              feePoisha: fee,
              stipendPoisha: stipend,
            }),
            participantFeePoisha: fee?.toString() ?? null,
            stipendPoisha: stipend?.toString() ?? null,
            schedule: {
              startsAt: job.starts_at?.toISOString() ?? null,
              endsAt: job.ends_at?.toISOString() ?? null,
              flexibleHours: job.flexible_hours,
            },
            deliveryMode: DELIVERY_MODE[job.work_arrangement],
            locationId: job.location_id,
            mentorUserId,
            learnerUserId: application.worker_user_id,
            acceptedAt: now.toISOString(),
          },
        },
      });
      return assignment.id;
    });
    await this.notifications?.create({
      userId: application.worker_user_id,
      type: "LEARNING_ACCEPTED",
      title: "আবেদন গৃহীত হয়েছে",
      body: `${job.title} — আপনি ভর্তি হয়েছেন। শর্ত ও সময়সূচি দেখুন।`,
      payload: { route: `/learn/enrolments/${assignmentId}`, assignmentId },
      dedupeKey: `learning-accepted:${assignmentId}`,
    });
    return this.enrolment(mentorUserId, assignmentId);
  }

  async decline(mentorUserId: string, applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (
      !application ||
      application.job.poster_user_id !== mentorUserId ||
      application.job.opportunity_type === "WORK"
    )
      throw new NotFoundException();
    const updated = await this.prisma.application.updateMany({
      where: { id: applicationId, status: ApplicationStatus.PENDING },
      data: { status: ApplicationStatus.REJECTED },
    });
    if (updated.count !== 1)
      throw new ConflictException("Application is no longer pending.");
    await this.notifications?.create({
      userId: application.worker_user_id,
      type: "LEARNING_DECLINED",
      title: "আবেদনের ফল",
      body: `${application.job.title} — এবার আসন দেওয়া যায়নি।`,
      payload: { route: `/learn/opportunities/${application.job_id}` },
      dedupeKey: `learning-declined:${applicationId}`,
    });
    return { id: applicationId, status: ApplicationStatus.REJECTED };
  }

  /**
   * The learner withdraws an application. Before acceptance it just becomes
   * WITHDRAWN; an accepted one withdraws the enrolment too. Learning has no
   * cancellation penalty, and withdrawing twice changes nothing.
   */
  async withdrawApplication(
    learnerUserId: string,
    applicationId: string,
    input: WithdrawLearningDto = {},
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        assignments: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (
      !application ||
      application.worker_user_id !== learnerUserId ||
      application.job.opportunity_type === "WORK"
    )
      throw new NotFoundException();
    const enrolmentId = application.assignments[0]?.id ?? null;
    if (application.status === ApplicationStatus.ACCEPTED && enrolmentId) {
      const enrolment = await this.withdrawEnrolment(
        learnerUserId,
        enrolmentId,
        input,
      );
      return {
        id: applicationId,
        status: ApplicationStatus.WITHDRAWN,
        enrolment,
      };
    }
    if (application.status !== ApplicationStatus.WITHDRAWN) {
      const updated = await this.prisma.application.updateMany({
        where: {
          id: applicationId,
          status: {
            in: [ApplicationStatus.PENDING, ApplicationStatus.SHORTLISTED],
          },
        },
        data: { status: ApplicationStatus.WITHDRAWN, withdrawn_at: new Date() },
      });
      if (updated.count !== 1)
        throw new ConflictException({
          code: "APPLICATION_NOT_WITHDRAWABLE",
          message: "This application can no longer be withdrawn.",
          messageKey: "error.learning.application_not_withdrawable",
        });
      await this.notifyWithdrawal(application.job, {
        dedupeKey: `learning-withdrawn:application:${applicationId}:${Date.now()}`,
        route: `/learn/opportunities/${application.job_id}`,
        enrolled: false,
      });
    }
    return {
      id: applicationId,
      status: ApplicationStatus.WITHDRAWN,
      enrolment: enrolmentId
        ? await this.enrolment(learnerUserId, enrolmentId)
        : null,
    };
  }

  /**
   * The learner leaves an active enrolment: the enrolment is CANCELLED by
   * them with no penalty (cancellation_penalised false, and learning never
   * counts in reliability), the seat is freed and the mentor is told.
   */
  async withdrawEnrolment(
    learnerUserId: string,
    assignmentId: string,
    input: WithdrawLearningDto = {},
  ) {
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        worker_user_id: learnerUserId,
        job: LEARNING_ONLY,
      },
      include: { job: true },
    });
    if (!assignment) throw new NotFoundException();
    if (
      assignment.status === AssignmentStatus.CANCELLED &&
      assignment.cancelled_by_user_id === learnerUserId
    )
      return this.enrolment(learnerUserId, assignmentId);
    if (assignment.status !== AssignmentStatus.CONFIRMED)
      throw new ConflictException({
        code: "ENROLMENT_NOT_ACTIVE",
        message: "Only an active enrolment can be withdrawn from.",
        messageKey: "error.learning.enrolment_not_active",
      });
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.assignment.updateMany({
        where: { id: assignmentId, status: AssignmentStatus.CONFIRMED },
        data: {
          status: AssignmentStatus.CANCELLED,
          cancelled_at: now,
          cancelled_by_user_id: learnerUserId,
          cancellation_penalised: false,
          cancel_reason: input.reason?.trim() || "LEARNER_WITHDREW",
        },
      });
      if (updated.count !== 1)
        throw new ConflictException({
          code: "ENROLMENT_NOT_ACTIVE",
          message: "Only an active enrolment can be withdrawn from.",
          messageKey: "error.learning.enrolment_not_active",
        });
      await transaction.application.update({
        where: { id: assignment.application_id },
        data: { status: ApplicationStatus.WITHDRAWN, withdrawn_at: now },
      });
      // The seat goes back to the mentor's pool.
      await transaction.$executeRaw`
        UPDATE jobs SET workers_filled = GREATEST(workers_filled - 1, 0)
        WHERE id = ${assignment.job_id}::uuid`;
    });
    await this.notifyWithdrawal(assignment.job, {
      dedupeKey: `learning-withdrawn:enrolment:${assignmentId}`,
      route: `/learn/enrolments/${assignmentId}`,
      enrolled: true,
    });
    return this.enrolment(learnerUserId, assignmentId);
  }

  private notifyWithdrawal(
    job: { id: string; title: string; poster_user_id: string },
    options: { dedupeKey: string; route: string; enrolled: boolean },
  ) {
    return this.notifications?.create({
      userId: job.poster_user_id,
      type: "LEARNING_WITHDRAWN",
      title: options.enrolled
        ? "একজন শিক্ষার্থী সরে গেছেন"
        : "একজন শিক্ষার্থী আবেদন প্রত্যাহার করেছেন",
      body: options.enrolled
        ? `${job.title} — একজন শিক্ষার্থী ভর্তি থেকে সরে গেছেন। একটি আসন খালি হয়েছে।`
        : `${job.title} — একজন শিক্ষার্থী আবেদন প্রত্যাহার করেছেন।`,
      payload: { route: options.route, opportunityId: job.id },
      dedupeKey: options.dedupeKey,
    });
  }

  /** One enrolment, for its mentor or its learner. */
  async enrolment(userId: string, assignmentId: string) {
    const row = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        job: LEARNING_ONLY,
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: enrolmentInclude,
    });
    if (!row) throw new NotFoundException();
    return this.serialize(row, userId);
  }

  /** The user's enrolments, as learner and as mentor. */
  /**
   * R7 (mobile M6): the learner's own learning applications, newest first.
   * The mentor's name is masked unless they show it or accepted the learner.
   */
  async myApplications(learnerUserId: string, query: CursorQueryDto = {}) {
    const limit = query.limit ?? 50;
    const hidden = await this.blocks.hiddenFrom(learnerUserId);
    const rows = await this.prisma.application.findMany({
      where: {
        worker_user_id: learnerUserId,
        job: {
          ...LEARNING_ONLY,
          deleted_at: null,
          poster_user_id: { notIn: hidden },
        },
      },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            opportunity_type: true,
            status: true,
            starts_at: true,
            ends_at: true,
            poster_user_id: true,
            poster: {
              select: {
                profile: {
                  select: { display_name: true, show_full_name: true },
                },
              },
            },
          },
        },
        assignments: {
          select: { id: true },
          orderBy: { created_at: "desc" },
          take: 1,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const { items, nextCursor } = pageResult(rows, limit);
    return {
      items: items.map((row) => ({
        id: row.id,
        status: row.status,
        message: row.message,
        appliedAt: row.created_at.toISOString(),
        respondedAt: row.responded_at?.toISOString() ?? null,
        withdrawnAt: row.withdrawn_at?.toISOString() ?? null,
        enrolmentId: row.assignments[0]?.id ?? null,
        opportunity: {
          id: row.job.id,
          title: row.job.title,
          opportunityType: row.job.opportunity_type,
          status: row.job.status,
          startsAt: row.job.starts_at?.toISOString() ?? null,
          endsAt: row.job.ends_at?.toISOString() ?? null,
        },
        mentor: {
          userId: row.job.poster_user_id,
          displayName: visibleDisplayName(
            row.job.poster.profile?.display_name ?? "",
            {
              showFullName: row.job.poster.profile?.show_full_name ?? false,
              hired: row.assignments.length > 0,
            },
          ),
        },
      })),
      nextCursor,
    };
  }

  async enrolments(userId: string) {
    const rows = await this.prisma.assignment.findMany({
      where: {
        job: LEARNING_ONLY,
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: enrolmentInclude,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 100,
    });
    return {
      items: rows.map((row) => this.serialize(row, userId)),
    };
  }

  async recordSession(
    mentorUserId: string,
    assignmentId: string,
    input: RecordLearningSessionDto,
  ) {
    await this.mentors.assertApproved(mentorUserId);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        job: { ...LEARNING_ONLY, poster_user_id: mentorUserId },
      },
      include: { job: { select: { title: true } } },
    });
    if (!assignment) throw new NotFoundException();
    if (assignment.status !== AssignmentStatus.CONFIRMED)
      throw new ConflictException({
        code: "ENROLMENT_NOT_ACTIVE",
        message: "Sessions can be recorded only for an active enrolment.",
        messageKey: "error.learning.enrolment_not_active",
      });
    const heldAt = new Date(input.heldAt);
    // W16: a session can't predate the enrolment by more than a week (a
    // mentor may record a few sessions held just before accepting).
    if (heldAt.getTime() < assignment.created_at.getTime() - 7 * 86_400_000)
      throw new ConflictException({
        code: "SESSION_BEFORE_ENROLMENT",
        message: "A session can't be dated before the learner was enrolled.",
        messageKey: "error.learning.session_before_enrolment",
        field: "heldAt",
      });
    if (heldAt.getTime() > Date.now() + 5 * 60_000)
      throw new ConflictException({
        code: "SESSION_IN_FUTURE",
        message: "Record a session after it has happened.",
        messageKey: "error.learning.session_in_future",
      });
    const session = await this.prisma.learningSession.create({
      data: {
        assignment_id: assignmentId,
        held_at: heldAt,
        minutes: input.minutes,
        topic: input.topic.trim(),
        notes: input.notes?.trim() || null,
        recorded_by_user_id: mentorUserId,
      },
    });
    await this.notifications?.create({
      userId: assignment.worker_user_id,
      type: "LEARNING_SESSION_RECORDED",
      title: "নতুন ক্লাস নথিভুক্ত",
      body: `${assignment.job.title}: "${session.topic}" — উপস্থিতি নিশ্চিত করুন।`,
      payload: { route: `/learn/enrolments/${assignmentId}`, assignmentId },
      dedupeKey: `learning-session:${session.id}`,
    });
    return this.enrolment(mentorUserId, assignmentId);
  }

  /**
   * P1.4: the mentor confirms the learner completed it. Issues a
   * PRACTICAL_CHECKED completion record (publicly verifiable, counts for
   * matching on the opportunity's skill). Needs at least one session the
   * learner confirmed, so a record can't be issued for nothing.
   */
  async complete(mentorUserId: string, assignmentId: string) {
    await this.mentors.assertApproved(mentorUserId);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        job: { ...LEARNING_ONLY, poster_user_id: mentorUserId },
      },
      include: {
        job: { include: { skills: { take: 1, orderBy: { skill_id: "asc" } } } },
        completion_record: { select: { id: true } },
        learning_sessions: {
          where: { learner_confirmed_at: { not: null } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!assignment) throw new NotFoundException();
    if (assignment.completion_record)
      return this.enrolment(mentorUserId, assignmentId);
    if (assignment.status !== AssignmentStatus.CONFIRMED)
      throw new ConflictException({
        code: "ENROLMENT_NOT_ACTIVE",
        message: "Only an active enrolment can be completed.",
        messageKey: "error.learning.enrolment_not_active",
      });
    if (assignment.learning_sessions.length === 0)
      throw new ConflictException({
        code: "NO_CONFIRMED_SESSIONS",
        message:
          "The learner must confirm at least one session before completion.",
        messageKey: "error.learning.no_confirmed_sessions",
      });
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const code = await generateUniqueCertificateCode(
        async (candidate) =>
          (await transaction.trainingCertificate.count({
            where: { public_code: candidate },
          })) > 0,
      );
      await transaction.trainingCertificate.create({
        data: {
          user_id: assignment.worker_user_id,
          assignment_id: assignmentId,
          issued_by_user_id: mentorUserId,
          skill_id: assignment.job.skills[0]?.skill_id ?? null,
          title: assignment.job.title,
          evidence_level: EvidenceLevel.PRACTICAL_CHECKED,
          public_code: code,
          issued_at: now,
        },
      });
      await transaction.assignment.update({
        where: { id: assignmentId },
        data: { status: AssignmentStatus.COMPLETED, submitted_at: now },
      });
    });
    await this.notifications?.create({
      userId: assignment.worker_user_id,
      type: "LEARNING_COMPLETED",
      title: "সমাপ্তির সনদ পেয়েছেন",
      body: `${assignment.job.title} — মেন্টর আপনার শেখা সম্পন্ন হিসেবে নিশ্চিত করেছেন।`,
      payload: { route: `/learn/enrolments/${assignmentId}`, assignmentId },
      dedupeKey: `learning-completed:${assignmentId}`,
    });
    return this.enrolment(mentorUserId, assignmentId);
  }

  async confirmSession(learnerUserId: string, sessionId: string) {
    const session = await this.prisma.learningSession.findUnique({
      where: { id: sessionId },
      include: { assignment: true },
    });
    if (!session || session.assignment.worker_user_id !== learnerUserId)
      throw new NotFoundException();
    if (!session.learner_confirmed_at)
      await this.prisma.learningSession.update({
        where: { id: sessionId },
        data: { learner_confirmed_at: new Date() },
      });
    return this.enrolment(learnerUserId, session.assignment_id);
  }

  private async ownedOpportunity(mentorUserId: string, id: string) {
    const job = await this.prisma.job.findFirst({
      where: { ...LEARNING_ONLY, id, poster_user_id: mentorUserId },
    });
    if (!job) throw new NotFoundException();
    return job;
  }

  private serialize(
    row: Prisma.AssignmentGetPayload<{ include: typeof enrolmentInclude }>,
    viewerUserId: string,
  ) {
    const isMentor = row.job.poster_user_id === viewerUserId;
    const sessions = row.learning_sessions;
    const learnerProfile = row.worker.profile;
    return {
      id: row.id,
      role: isMentor ? "MENTOR" : "LEARNER",
      status: row.status,
      opportunity: {
        id: row.job.id,
        title: row.job.title,
        opportunityType: row.job.opportunity_type,
        location: row.job.location,
      },
      learner: {
        userId: row.worker_user_id,
        displayName: visibleDisplayName(learnerProfile?.display_name ?? "", {
          showFullName: learnerProfile?.show_full_name ?? false,
          // An enrolment is a confirmed engagement.
          hired: true,
        }),
      },
      mentorUserId: row.job.poster_user_id,
      // What the learner agreed to, frozen at acceptance.
      contract: row.contracts[0]
        ? {
            version: row.contracts[0].version,
            ...(row.contracts[0].snapshot_json as Record<string, unknown>),
          }
        : null,
      sessions: sessions.map((item) => ({
        id: item.id,
        heldAt: item.held_at.toISOString(),
        minutes: item.minutes,
        topic: item.topic,
        notes: item.notes,
        learnerConfirmedAt: item.learner_confirmed_at?.toISOString() ?? null,
      })),
      progress: {
        sessionsRecorded: sessions.length,
        sessionsConfirmed: sessions.filter((item) => item.learner_confirmed_at)
          .length,
        minutesTotal: sessions.reduce((sum, item) => sum + item.minutes, 0),
      },
      enrolledAt: row.confirmed_at?.toISOString() ?? null,
      withdrawnAt:
        row.status === AssignmentStatus.CANCELLED &&
        row.cancelled_by_user_id === row.worker_user_id
          ? (row.cancelled_at?.toISOString() ?? null)
          : null,
      completedAt: row.completion_record?.issued_at.toISOString() ?? null,
      completionRecord: row.completion_record
        ? {
            id: row.completion_record.id,
            code: row.completion_record.public_code,
            evidenceLevel: row.completion_record.evidence_level,
            issuedAt: row.completion_record.issued_at.toISOString(),
            status: row.completion_record.revoked_at ? "REVOKED" : "VALID",
            verifyPath: `/api/v1/certificates/${row.completion_record.public_code}`,
          }
        : null,
      viewerIsLearner: row.worker_user_id === viewerUserId,
    };
  }
}
