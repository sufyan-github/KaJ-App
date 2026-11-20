import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  ApplicationStatus,
  AssignmentStatus,
  JobActorType,
  JobStatus,
  MentorStatus,
  JobType,
  OpportunityType,
  ParticipantTerms,
  PaymentModel,
  Prisma,
  TrustLevel,
  WorkArrangement,
} from "@prisma/client";

import { pageArgs, pageResult } from "../../common/api/cursor-page";
import { withinLocation } from "../../common/location-scope";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CLOSABLE, endOpenJob, jobNotClosable } from "../jobs/close-job";
import { JobStateMachine } from "../jobs/state-machine/job-state.machine";
import { MentorsService } from "../mentors/mentors.service";
import { NotificationsService } from "../notifications/notifications.service";
import { EngagementService } from "../safety/engagement.service";
import { UserBlocksService } from "../safety/user-blocks.service";
import { visibleDisplayName } from "../users/public-profile.projection";
import {
  ApplyToLearningDto,
  CreateLearningOpportunityDto,
  LearningFeedQueryDto,
} from "./dto/learning.dto";
import { OPPORTUNITY_LABEL, termsText } from "./learning-terms";

/** Learning opportunities: every non-WORK jobs row. */
export const LEARNING_ONLY = {
  opportunity_type: { not: OpportunityType.WORK },
} as const satisfies Prisma.JobWhereInput;

const opportunityInclude = {
  category: { select: { id: true, name_bn: true, name_en: true } },
  location: { select: { id: true, name_bn: true, name_en: true } },
  skills: {
    include: { skill: { select: { id: true, name_bn: true, name_en: true } } },
  },
  poster: {
    select: {
      id: true,
      profile: {
        select: {
          display_name: true,
          show_full_name: true,
          trust_level: true,
          mentor_bio: true,
          mentor_years_experience: true,
        },
      },
    },
  },
  training_course: { select: { id: true, title_en: true, title_bn: true } },
} satisfies Prisma.JobInclude;

type OpportunityRow = Prisma.JobGetPayload<{
  include: typeof opportunityInclude;
}>;

/**
 * KAAJ Learn (P1.2): trainings and apprenticeships, stored as jobs rows with
 * a non-WORK opportunity_type so they reuse applications, assignments, chat,
 * attendance and reviews — but never the work feed, fees or penalties.
 * Learn is free: nothing here asks for a subscription.
 */
@Injectable()
export class LearningService {
  private readonly states = new JobStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mentors: MentorsService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() private readonly userBlocks?: UserBlocksService,
    @Optional() private readonly engagementService?: EngagementService,
  ) {}

  private get blocks() {
    return this.userBlocks ?? new UserBlocksService(this.prisma);
  }

  private get engagement() {
    return this.engagementService ?? new EngagementService(this.prisma);
  }

  async create(mentorUserId: string, input: CreateLearningOpportunityDto) {
    await this.mentors.assertApproved(mentorUserId);
    const money = learningMoney(input);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (endsAt <= startsAt)
      throw new BadRequestException("The end must be after the start.");
    if (startsAt.getTime() < Date.now() - 60_000)
      throw new BadRequestException("The start must be in the future.");
    await this.assertReferences(input);

    const created = await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.job.create({
        data: {
          poster_user_id: mentorUserId,
          opportunity_type: input.opportunityType,
          participant_terms: input.participantTerms,
          participant_fee_poisha: money.feePoisha,
          // A stipend uses the budget fields (what the learner receives).
          budget_min_poisha: money.stipendPoisha,
          budget_max_poisha: money.stipendPoisha,
          title: input.title.trim(),
          description: input.description.trim(),
          category_id: input.categoryId,
          location_id: input.locationId,
          job_type: JobType.ONE_TIME,
          payment_model: PaymentModel.FIXED,
          workers_required: input.seats,
          starts_at: startsAt,
          ends_at: endsAt,
          work_arrangement: input.workArrangement ?? WorkArrangement.ON_SITE,
          flexible_hours: input.flexibleHours ?? false,
          training_course_id: input.trainingCourseId,
          skills: {
            create: input.skillIds.map((skillId) => ({ skill_id: skillId })),
          },
        },
        include: opportunityInclude,
      });
      await this.states.recordInitialDraft(transaction, job.id, mentorUserId);
      return job;
    });
    return this.serialize(created, mentorUserId);
  }

  /** Only an approved mentor publishes; suspension stops new publishing. */
  async publish(mentorUserId: string, id: string) {
    await this.mentors.assertApproved(mentorUserId);
    const job = await this.prisma.job.findFirst({
      where: {
        ...LEARNING_ONLY,
        id,
        poster_user_id: mentorUserId,
        deleted_at: null,
      },
    });
    if (!job) throw new NotFoundException();
    if (job.status !== JobStatus.DRAFT)
      throw new ConflictException("Only a draft can be published.");
    await this.prisma.$transaction(async (transaction) => {
      const published = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.PUBLISHED,
        { type: JobActorType.POSTER, userId: mentorUserId },
      );
      await transaction.job.update({
        where: { id },
        data: { published_at: new Date(), expires_at: job.starts_at },
      });
      await this.states.transitionInTransaction(
        transaction,
        published,
        JobStatus.APPLICATIONS_OPEN,
        { type: JobActorType.SYSTEM },
      );
    });
    return this.get(mentorUserId, id);
  }

  async feed(viewerUserId: string, query: LearningFeedQueryDto) {
    const limit = query.limit ?? 20;
    const hidden = await this.blocks.hiddenFrom(viewerUserId);
    const rows = await this.prisma.job.findMany({
      where: {
        ...LEARNING_ONLY,
        ...(query.opportunityType
          ? { opportunity_type: query.opportunityType }
          : {}),
        status: JobStatus.APPLICATIONS_OPEN,
        deleted_at: null,
        poster_user_id: { notIn: [viewerUserId, ...hidden] },
        OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        // W7: full ones and those of a suspended mentor are not offered.
        workers_filled: { lt: this.prisma.job.fields.workers_required },
        poster: {
          profile: { mentor_status: { not: MentorStatus.SUSPENDED } },
        },
        participant_terms: query.participantTerms,
        work_arrangement: query.workArrangement,
        // W13: a thana or city also finds its areas' opportunities.
        location: withinLocation(query.locationId),
        skills: query.skillId
          ? { some: { skill_id: query.skillId } }
          : undefined,
      },
      include: opportunityInclude,
      orderBy: [{ published_at: "desc" }, { id: "desc" }],
      ...pageArgs({ limit, cursor: query.cursor }),
    });
    const page = pageResult(rows, limit);
    return {
      nextCursor: page.nextCursor,
      items: await Promise.all(
        page.items.map((row) => this.serialize(row, viewerUserId)),
      ),
    };
  }

  async get(viewerUserId: string, id: string) {
    const job = await this.prisma.job.findFirst({
      where: { ...LEARNING_ONLY, id, deleted_at: null },
      include: {
        ...opportunityInclude,
        applications: {
          where: { worker_user_id: viewerUserId },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });
    if (!job) throw new NotFoundException();
    const isMentor = job.poster_user_id === viewerUserId;
    const involved = isMentor || job.applications.length > 0;
    const open =
      job.status === JobStatus.APPLICATIONS_OPEN ||
      job.status === JobStatus.PUBLISHED;
    if (!involved && !open) throw new NotFoundException();
    if (
      !isMentor &&
      (await this.blocks.between(viewerUserId, job.poster_user_id))
    )
      throw new NotFoundException();
    return {
      ...(await this.serialize(job, viewerUserId)),
      viewerApplication: job.applications[0] ?? null,
    };
  }

  async mine(mentorUserId: string) {
    const rows = await this.prisma.job.findMany({
      where: {
        ...LEARNING_ONLY,
        poster_user_id: mentorUserId,
        deleted_at: null,
      },
      include: {
        ...opportunityInclude,
        _count: { select: { applications: true } },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 100,
    });
    return {
      items: await Promise.all(
        rows.map(async (row) => ({
          ...(await this.serialize(row, mentorUserId)),
          applicationsCount: row._count.applications,
        })),
      ),
    };
  }

  /** A learner applies. Free: no subscription, no hiring trust gate. */
  async close(mentorUserId: string, id: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        ...LEARNING_ONLY,
        id,
        poster_user_id: mentorUserId,
        deleted_at: null,
      },
    });
    if (!job) throw new NotFoundException();
    if (!CLOSABLE.includes(job.status)) throw jobNotClosable(job.status);
    const enrolled = await this.prisma.assignment.count({
      where: {
        job_id: id,
        status: {
          in: [
            AssignmentStatus.PENDING_CONFIRMATION,
            AssignmentStatus.CONFIRMED,
          ],
        },
      },
    });
    if (enrolled) {
      // Learners keep their place; nobody new can apply.
      await this.prisma.job.update({
        where: { id },
        data: { expires_at: new Date() },
      });
      return { id, status: job.status, closedToApplications: true };
    }
    const closed = await endOpenJob(
      this.prisma,
      this.states,
      job,
      JobStatus.CANCELLED_BY_CUSTOMER,
      { type: JobActorType.POSTER, userId: mentorUserId },
      "Closed by the mentor.",
    );
    return { id, status: closed.status, closedToApplications: true };
  }

  async apply(learnerUserId: string, id: string, input: ApplyToLearningDto) {
    const job = await this.prisma.job.findFirst({
      where: { ...LEARNING_ONLY, id, deleted_at: null },
    });
    if (!job) throw new NotFoundException();
    if (job.poster_user_id === learnerUserId)
      throw new ConflictException({
        code: "OWN_OPPORTUNITY",
        message: "You can't apply to your own opportunity.",
        messageKey: "error.learning.own_opportunity",
      });
    if (await this.blocks.between(learnerUserId, job.poster_user_id))
      throw new NotFoundException();
    // W7: closed when full, or while the mentor is suspended.
    const mentor = await this.prisma.profile.findUnique({
      where: { user_id: job.poster_user_id },
      select: { mentor_status: true },
    });
    if (
      job.status !== JobStatus.APPLICATIONS_OPEN ||
      (job.expires_at && job.expires_at <= new Date()) ||
      job.workers_filled >= job.workers_required ||
      mentor?.mentor_status === MentorStatus.SUSPENDED
    )
      throw new ConflictException({
        code: "OPPORTUNITY_CLOSED",
        message: "This opportunity is not taking applications.",
        messageKey: "error.learning.closed",
      });
    // Someone who withdrew before acceptance may apply again: the same row
    // goes back to PENDING (one application per learner and opportunity).
    const previous = await this.prisma.application.findUnique({
      where: {
        job_id_worker_user_id: { job_id: id, worker_user_id: learnerUserId },
      },
      include: { _count: { select: { assignments: true } } },
    });
    if (
      previous?.status === ApplicationStatus.WITHDRAWN &&
      previous._count.assignments > 0
    )
      throw new ConflictException({
        code: "REAPPLY_NOT_ALLOWED",
        message: "You left this opportunity after being accepted.",
        messageKey: "error.learning.reapply_not_allowed",
      });
    const revived =
      previous?.status === ApplicationStatus.WITHDRAWN
        ? await this.prisma.application.update({
            where: { id: previous.id },
            data: {
              status: ApplicationStatus.PENDING,
              withdrawn_at: null,
              message: input.message?.trim() || null,
            },
          })
        : null;
    const application =
      revived ??
      (await this.prisma.application
        .create({
          data: {
            job_id: id,
            worker_user_id: learnerUserId,
            status: ApplicationStatus.PENDING,
            message: input.message?.trim() || null,
            proposed_starts_at: job.starts_at,
            proposed_ends_at: job.ends_at,
          },
        })
        .catch((error: unknown) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new ConflictException({
              code: "ALREADY_APPLIED",
              message: "You have already applied.",
              messageKey: "error.jobs.already_applied",
            });
          throw error;
        }));
    if (!revived)
      await this.prisma.job.update({
        where: { id },
        data: { applications_count: { increment: 1 } },
      });
    await this.notifications?.create({
      userId: job.poster_user_id,
      type: "LEARNING_APPLICATION",
      title: "নতুন শিক্ষার্থী আবেদন",
      body: `${job.title} — একজন শিক্ষার্থী আবেদন করেছেন।`,
      payload: { route: `/learn/opportunities/${id}`, opportunityId: id },
      dedupeKey: revived
        ? `learning-application:${application.id}:${Date.now()}`
        : `learning-application:${application.id}`,
    });
    return {
      id: application.id,
      opportunityId: id,
      status: application.status,
      message: application.message,
    };
  }

  private async assertReferences(input: CreateLearningOpportunityDto) {
    const [category, location, skills, course] = await Promise.all([
      this.prisma.category.count({
        where: { id: input.categoryId, is_active: true },
      }),
      this.prisma.location.count({
        where: { id: input.locationId, is_active: true },
      }),
      this.prisma.skill.count({
        where: { id: { in: input.skillIds }, is_active: true },
      }),
      input.trainingCourseId
        ? this.prisma.trainingCourse.count({
            where: { id: input.trainingCourseId, is_published: true },
          })
        : Promise.resolve(1),
    ]);
    if (!category || !location || skills !== input.skillIds.length || !course)
      throw new BadRequestException(
        "Category, area, skills and course must be active and known.",
      );
  }

  private async serialize(row: OpportunityRow, viewerUserId: string) {
    const isMentor = row.poster_user_id === viewerUserId;
    const profile = row.poster.profile;
    const stipend =
      row.participant_terms === ParticipantTerms.STIPEND
        ? row.budget_min_poisha
        : null;
    return {
      id: row.id,
      opportunityType: row.opportunity_type,
      typeLabel:
        OPPORTUNITY_LABEL[
          row.opportunity_type as "TRAINING" | "APPRENTICESHIP"
        ],
      title: row.title,
      description: row.description,
      status: row.status,
      participantTerms: row.participant_terms,
      participantFeePoisha: row.participant_fee_poisha?.toString() ?? null,
      stipendPoisha: stipend?.toString() ?? null,
      termsText: termsText({
        terms: row.participant_terms!,
        feePoisha: row.participant_fee_poisha,
        stipendPoisha: stipend,
      }),
      seats: row.workers_required,
      seatsFilled: row.workers_filled,
      startsAt: row.starts_at?.toISOString() ?? null,
      endsAt: row.ends_at?.toISOString() ?? null,
      workArrangement: row.work_arrangement,
      flexibleHours: row.flexible_hours,
      publishedAt: row.published_at?.toISOString() ?? null,
      category: row.category,
      location: row.location,
      skills: row.skills.map((item) => item.skill),
      trainingCourse: row.training_course,
      mentor: {
        id: row.poster.id,
        displayName: isMentor
          ? (profile?.display_name ?? "")
          : visibleDisplayName(profile?.display_name ?? "", {
              showFullName: profile?.show_full_name ?? false,
              hired: await this.engagement.hired(viewerUserId, row.poster.id),
            }),
        trustLevel: profile?.trust_level ?? TrustLevel.NONE,
        bio: profile?.mentor_bio ?? null,
        yearsExperience: profile?.mentor_years_experience ?? null,
      },
      viewerIsMentor: isMentor,
    };
  }
}

/** The fee or stipend the terms call for, and nothing else. */
function learningMoney(input: CreateLearningOpportunityDto) {
  const fee = input.participantFeePoisha
    ? BigInt(input.participantFeePoisha)
    : null;
  const stipend = input.stipendPoisha ? BigInt(input.stipendPoisha) : null;
  const paid = input.participantTerms === ParticipantTerms.PAID_BY_PARTICIPANT;
  const stipendTerms = input.participantTerms === ParticipantTerms.STIPEND;
  if (paid !== (fee !== null && fee > 0n))
    throw new BadRequestException({
      code: "LEARNING_TERMS_INVALID",
      message: paid
        ? "A paid opportunity needs a participant fee above zero."
        : "Only a paid opportunity has a participant fee.",
      messageKey: "error.learning.terms_invalid",
      field: "participantFeePoisha",
    });
  if (stipendTerms !== (stipend !== null && stipend > 0n))
    throw new BadRequestException({
      code: "LEARNING_TERMS_INVALID",
      message: stipendTerms
        ? "A stipend opportunity needs a stipend above zero."
        : "Only a stipend opportunity has a stipend.",
      messageKey: "error.learning.terms_invalid",
      field: "stipendPoisha",
    });
  return { feePoisha: fee, stipendPoisha: stipend };
}
