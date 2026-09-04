import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  ApplicationStatus,
  AssignmentStatus,
  JobActorType,
  JobStatus,
  JobType,
  PaymentModel,
  Prisma,
  TrustLevel,
  UserStatus,
  type Job,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { CLOCK, type Clock } from "../../common/time/clock";
import { AvailabilityService } from "../availability/availability.service";
import { MatchingService } from "../matching/matching.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ChatService } from "../chat/chat.service";
import {
  AcceptApplicationDto,
  ApplyToJobDto,
  CancelAssignmentDto,
  CreateBookingRequestDto,
  CreateJobDto,
  JobFeedQueryDto,
} from "./dto/jobs.dto";
import {
  calculateCancellation,
  defaultCancellationPolicy,
  type CancellationActor,
  type CancellationPolicy,
} from "./cancellation/cancellation.calculator";
import { JobStateMachine } from "./state-machine/job-state.machine";
import { recurrenceRuleJson } from "./recurrence/recurrence";
import { RecurrenceService } from "./recurrence/recurrence.service";
import { hasTrust } from "../verification/trust-level";

const jobInclude = {
  category: { select: { id: true, name_bn: true, name_en: true } },
  subcategory: { select: { id: true, name_bn: true, name_en: true } },
  location: { select: { id: true, name_bn: true, name_en: true } },
  skills: {
    include: { skill: { select: { id: true, name_bn: true, name_en: true } } },
  },
  schedules: true,
} satisfies Prisma.JobInclude;

@Injectable()
export class JobsService {
  private readonly states = new JobStateMachine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly matching?: MatchingService,
    private readonly notifications?: NotificationsService,
    @Optional() @Inject(CLOCK) private readonly clock?: Clock,
    @Optional() private readonly chat?: ChatService,
    @Optional() private readonly recurrence?: RecurrenceService,
  ) {}

  private now() {
    return this.clock?.now() ?? new Date();
  }

  async create(posterUserId: string, input: CreateJobDto) {
    if (input.jobType === JobType.RECURRING && !input.recurrenceRule) {
      throw new BadRequestException(
        "Recurring jobs require a recurrence rule.",
      );
    }
    if (input.jobType !== JobType.RECURRING && input.recurrenceRule) {
      throw new BadRequestException(
        "Only recurring jobs can have a recurrence rule.",
      );
    }
    if (input.recurrenceRule) await this.recurrence?.assertEnabled();
    const window = parseWindow(input.startsAt, input.endsAt);
    const job = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.job.create({
        data: {
          poster_user_id: posterUserId,
          title: input.title.trim(),
          description: input.description.trim(),
          category_id: input.categoryId,
          subcategory_id: input.subcategoryId,
          job_type: input.jobType,
          payment_model: input.paymentModel,
          budget_min_poisha: toBigInt(input.budgetMinPoisha),
          budget_max_poisha: toBigInt(input.budgetMaxPoisha),
          location_id: input.locationId,
          area_label: input.areaLabel?.trim(),
          starts_at: window?.startsAt,
          ends_at: window?.endsAt,
          workers_required: input.workersRequired ?? 1,
          recurrence_rule: input.recurrenceRule
            ? recurrenceRuleJson(input.recurrenceRule)
            : undefined,
          skills: {
            create: [...new Set(input.skillIds)].map((skillId) => ({
              skill_id: skillId,
            })),
          },
          schedules: {
            create: (input.schedules ?? []).map((schedule) => ({
              date: schedule.date ? new Date(schedule.date) : undefined,
              day_of_week: schedule.dayOfWeek,
              start_time: parseTime(schedule.startTime),
              end_time: parseTime(schedule.endTime),
            })),
          },
        },
        include: jobInclude,
      });
      await this.states.recordInitialDraft(
        transaction,
        created.id,
        posterUserId,
      );
      return created;
    });
    return serializeJob(job);
  }

  async publish(posterUserId: string, jobId: string) {
    const job = await this.ownedJob(posterUserId, jobId);
    if (job.status !== JobStatus.DRAFT) {
      throw new ConflictException("Only draft jobs can be published.");
    }
    validatePublishable(job);
    if (job.job_type === JobType.RECURRING) {
      if (!job.recurrence_rule) {
        throw new BadRequestException(
          "Recurring jobs require a recurrence rule.",
        );
      }
      await this.recurrence?.assertEnabled();
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const published = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.PUBLISHED,
        { type: JobActorType.POSTER, userId: posterUserId },
      );
      await transaction.job.update({
        where: { id: jobId },
        data: {
          published_at: new Date(),
          expires_at: job.starts_at ?? new Date(Date.now() + 14 * 86_400_000),
        },
      });
      await this.states.transitionInTransaction(
        transaction,
        published,
        JobStatus.APPLICATIONS_OPEN,
        { type: JobActorType.SYSTEM },
      );
      return transaction.job.findUniqueOrThrow({
        where: { id: jobId },
        include: jobInclude,
      });
    });
    if (job.job_type === JobType.RECURRING) {
      await this.recurrence?.generate(jobId);
    }
    return serializeJob(updated);
  }

  async feed(userId: string, query: JobFeedQueryDto) {
    const jobs = await this.prisma.job.findMany({
      where: {
        status: JobStatus.APPLICATIONS_OPEN,
        deleted_at: null,
        category_id: query.categoryId,
        location_id: query.locationId,
        skills: query.skillId
          ? { some: { skill_id: query.skillId } }
          : undefined,
      },
      include: jobInclude,
      orderBy: [{ is_featured: "desc" }, { published_at: "desc" }],
      take: 50,
    });
    const availabilityByJob = new Map<
      string,
      { timeCompatibility: string; availabilityCoverage: number | null }
    >();
    if (query.scope === "for-me") {
      await Promise.all(
        jobs.map(async (job) => {
          if (!job.starts_at || !job.ends_at) {
            availabilityByJob.set(job.id, {
              timeCompatibility: "NOT_SCHEDULED",
              availabilityCoverage: null,
            });
            return;
          }
          const result = await this.availability.evaluate(
            userId,
            { startsAt: job.starts_at, endsAt: job.ends_at },
            1,
          );
          availabilityByJob.set(job.id, {
            timeCompatibility: result.isAvailable ? "AVAILABLE" : "UNAVAILABLE",
            availabilityCoverage: result.coverage,
          });
        }),
      );
    }
    const visibleJobs =
      query.availableOnly === "true"
        ? jobs.filter(
            (job) =>
              availabilityByJob.get(job.id)?.timeCompatibility === "AVAILABLE",
          )
        : jobs;
    if (query.scope === "for-me" && this.matching) {
      const ranked = await this.matching.scoreJobsForWorker(
        userId,
        visibleJobs,
      );
      return {
        items: ranked.map(({ job, match }) => ({
          ...serializeJob(job),
          ...availabilityByJob.get(job.id),
          matchScore: match.score,
          matchReasons: match.reasons,
          matchComponents: match.components,
        })),
      };
    }
    return {
      items: visibleJobs.map((job) => ({
        ...serializeJob(job),
        ...availabilityByJob.get(job.id),
      })),
    };
  }

  async suggestedWorkers(posterUserId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, poster_user_id: posterUserId, deleted_at: null },
      include: { skills: true },
    });
    if (!job) throw new NotFoundException();
    if (!this.matching) return { items: [] };
    const ranked = await this.matching.suggestedWorkers(job);
    return {
      items: ranked.map(({ worker, match }) => ({
        id: worker.id,
        displayName: worker.profile?.display_name ?? "Worker",
        ratingAverage: worker.worker_profile?.rating_avg.toString() ?? "0",
        experienceYears: worker.worker_profile?.experience_years ?? 0,
        skills: worker.skills.map((item) => ({
          nameEn: item.skill.name_en,
          nameBn: item.skill.name_bn,
        })),
        matchScore: match.score,
        matchReasons: match.reasons,
      })),
    };
  }

  async mine(posterUserId: string) {
    const jobs = await this.prisma.job.findMany({
      where: { poster_user_id: posterUserId, deleted_at: null },
      include: jobInclude,
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return { items: jobs.map(serializeJob) };
  }

  async get(jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, deleted_at: null },
      include: jobInclude,
    });
    if (!job) throw new NotFoundException();
    return serializeJob(job);
  }

  async apply(workerUserId: string, jobId: string, input: ApplyToJobDto) {
    const [job, worker] = await Promise.all([
      this.prisma.job.findFirst({
        where: {
          id: jobId,
          status: JobStatus.APPLICATIONS_OPEN,
          deleted_at: null,
        },
      }),
      this.prisma.user.findFirst({
        where: { id: workerUserId, deleted_at: null },
        select: {
          status: true,
          reverification_required: true,
          profile: { select: { trust_level: true } },
        },
      }),
    ]);
    if (!job) throw new NotFoundException();
    if (
      !worker ||
      worker.status !== UserStatus.ACTIVE ||
      worker.reverification_required ||
      !hasTrust(
        worker.profile?.trust_level ?? TrustLevel.NONE,
        TrustLevel.IDENTITY,
      )
    ) {
      throw new ForbiddenException(
        "Approved identity verification with NID and selfie is required before applying.",
      );
    }
    if (job.poster_user_id === workerUserId) {
      throw new ForbiddenException(
        "A job poster cannot apply to their own job.",
      );
    }
    const window = requiredWindow(input.proposedStartsAt, input.proposedEndsAt);
    const result = await this.availability.evaluate(workerUserId, window, 1);
    if (!result.isAvailable) {
      throw new ConflictException("Worker is not available for this slot.");
    }
    const application = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.application.create({
        data: {
          job_id: jobId,
          worker_user_id: workerUserId,
          message: input.message?.trim(),
          proposed_price_poisha: toBigInt(input.proposedPricePoisha),
          proposed_starts_at: window.startsAt,
          proposed_ends_at: window.endsAt,
        },
      });
      await transaction.job.update({
        where: { id: jobId },
        data: { applications_count: { increment: 1 } },
      });
      return created;
    });
    await this.notifications?.create({
      userId: job.poster_user_id,
      type: "JOB_APPLICATION_RECEIVED",
      title: "নতুন আবেদন",
      body: `${job.title} কাজটিতে একজন কর্মী আবেদন করেছেন। আবেদন দেখুন।`,
      payload: { route: "/jobs", jobId: job.id },
      dedupeKey: `application:${application.id}`,
    });
    await this.chat?.systemMessageForJob(
      jobId,
      workerUserId,
      "কর্মী কাজটিতে আবেদন করেছেন। নিরাপত্তার জন্য আলোচনা ও পেমেন্ট KAAJ-এ রাখুন।",
    );
    return serializeApplication(application);
  }

  async listApplications(posterUserId: string, jobId: string) {
    await this.ownedJob(posterUserId, jobId);
    const applications = await this.prisma.application.findMany({
      where: { job_id: jobId },
      orderBy: { created_at: "desc" },
    });
    return { items: applications.map(serializeApplication) };
  }

  async listAssignments(userId: string) {
    await this.reconcileDueAssignments(userId);
    const assignments = await this.prisma.assignment.findMany({
      where: {
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: {
        job: { select: { title: true, poster_user_id: true, status: true } },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return {
      items: assignments.map((assignment) => ({
        ...serializeAssignment(assignment),
        title: assignment.job.title,
        jobStatus: assignment.job.status,
        confirmationDeadlineAt:
          assignment.confirmation_deadline_at?.toISOString() ?? null,
        submittedAt: assignment.submitted_at?.toISOString() ?? null,
        completionDueAt: assignment.completion_due_at?.toISOString() ?? null,
        isWorker: assignment.worker_user_id === userId,
        isPoster: assignment.job.poster_user_id === userId,
        posterUserId: assignment.job.poster_user_id,
      })),
    };
  }

  async getAssignment(userId: string, assignmentId: string) {
    await this.reconcileDueAssignments(userId);
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: {
        job: {
          include: {
            status_history: { orderBy: { created_at: "asc" } },
            location: { select: { name_bn: true, name_en: true } },
          },
        },
        contracts: { orderBy: { version: "desc" } },
      },
    });
    if (!assignment) throw new NotFoundException();
    return {
      ...serializeAssignment(assignment),
      title: assignment.job.title,
      description: assignment.job.description,
      locationName: assignment.job.location.name_bn,
      jobStatus: assignment.job.status,
      isWorker: assignment.worker_user_id === userId,
      isPoster: assignment.job.poster_user_id === userId,
      posterUserId: assignment.job.poster_user_id,
      confirmationDeadlineAt:
        assignment.confirmation_deadline_at?.toISOString() ?? null,
      submittedAt: assignment.submitted_at?.toISOString() ?? null,
      completionDueAt: assignment.completion_due_at?.toISOString() ?? null,
      contractVersion: assignment.contracts[0]?.version ?? null,
      timeline: assignment.job.status_history.map((item) => ({
        status: item.to_status,
        at: item.created_at.toISOString(),
        reason: item.reason,
      })),
    };
  }

  async submitWork(workerUserId: string, assignmentId: string) {
    const assignment = await this.participantAssignment(
      workerUserId,
      assignmentId,
    );
    if (assignment.worker_user_id !== workerUserId)
      throw new NotFoundException();
    if (assignment.status !== AssignmentStatus.CONFIRMED) {
      throw new ConflictException("Only confirmed work can be submitted.");
    }
    const settings = await this.assignmentSettings();
    const now = this.now();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const checkinFlag = await transaction.featureFlag.findUnique({
        where: { key: "checkin_enabled" },
      });
      if (
        checkinFlag?.is_enabled === true &&
        checkinFlag.rollout_percent === 100
      ) {
        throw new ConflictException(
          "Check-in is enabled. Complete work through the check-out endpoint.",
        );
      }
      let job = await transaction.job.findUniqueOrThrow({
        where: { id: assignment.job_id },
      });
      job = await this.advanceForTime(transaction, job, assignment, now);
      if (job.status !== JobStatus.IN_PROGRESS) {
        throw new ConflictException(
          "Work cannot be submitted before it starts.",
        );
      }
      const submitted = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.SUBMITTED,
        { type: JobActorType.WORKER, userId: workerUserId },
      );
      await this.states.transitionInTransaction(
        transaction,
        submitted,
        JobStatus.CUSTOMER_REVIEW,
        { type: JobActorType.SYSTEM },
      );
      return transaction.assignment.update({
        where: { id: assignmentId },
        data: {
          submitted_at: now,
          completion_due_at: new Date(
            now.getTime() + settings.autoConfirmHours * 3_600_000,
          ),
        },
      });
    });
    await this.notifications?.create({
      userId: assignment.job.poster_user_id,
      type: "WORK_SUBMITTED",
      title: "কাজ জমা হয়েছে",
      body: `${assignment.job.title} কাজটি পর্যালোচনা করে নিশ্চিত করুন।`,
      payload: { route: "/assignments", assignmentId },
      dedupeKey: `assignment:${assignmentId}:submitted`,
    });
    return serializeAssignment(updated);
  }

  async completeWork(posterUserId: string, assignmentId: string) {
    const assignment = await this.participantAssignment(
      posterUserId,
      assignmentId,
    );
    if (assignment.job.poster_user_id !== posterUserId)
      throw new NotFoundException();
    return this.finishAssignment(
      assignmentId,
      JobActorType.POSTER,
      posterUserId,
    );
  }

  async cancelPreview(
    userId: string,
    assignmentId: string,
    input: CancelAssignmentDto,
  ) {
    const assignment = await this.participantAssignment(userId, assignmentId);
    const actor = this.cancellationActor(userId, assignment);
    const policy = await this.cancellationPolicy();
    return calculateCancellation({
      actor,
      now: this.now(),
      startsAt: assignment.agreed_starts_at ?? this.now(),
      agreedPricePoisha: assignment.agreed_price_poisha,
      reasonCode: input.reasonCode,
      policy,
    });
  }

  async cancelAssignment(
    userId: string,
    assignmentId: string,
    input: CancelAssignmentDto,
  ) {
    if (input.confirmed !== true) {
      throw new BadRequestException("Preview and confirm cancellation first.");
    }
    const assignment = await this.participantAssignment(userId, assignmentId);
    if (
      assignment.status === AssignmentStatus.CANCELLED ||
      assignment.status === AssignmentStatus.COMPLETED
    ) {
      throw new ConflictException("Assignment can no longer be cancelled.");
    }
    const actor = this.cancellationActor(userId, assignment);
    const preview = await this.cancelPreview(userId, assignmentId, input);
    const to =
      actor === "customer"
        ? JobStatus.CANCELLED_BY_CUSTOMER
        : JobStatus.CANCELLED_BY_WORKER;
    const actorType =
      actor === "customer" ? JobActorType.POSTER : JobActorType.WORKER;
    const strikeCutoff = new Date(
      this.now().getTime() -
        (await this.cancellationPolicy()).strikeWindowDays * 86_400_000,
    );
    const previousStrikes = preview.addsStrike
      ? await this.prisma.auditLog.count({
          where: {
            actor_user_id: userId,
            action: "CANCELLATION_STRIKE",
            created_at: { gte: strikeCutoff },
          },
        })
      : 0;
    await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.job.findUniqueOrThrow({
        where: { id: assignment.job_id },
      });
      await this.states.transitionInTransaction(
        transaction,
        job,
        to,
        { type: actorType, userId },
        input.reasonCode,
      );
      await transaction.assignment.update({
        where: { id: assignmentId },
        data: {
          status: AssignmentStatus.CANCELLED,
          cancelled_at: this.now(),
          cancel_reason: `${input.reasonCode}${input.note ? `: ${input.note.trim()}` : ""}`,
        },
      });
      if (
        assignment.status === AssignmentStatus.CONFIRMED &&
        job.workers_filled > 0
      ) {
        await transaction.job.update({
          where: { id: job.id },
          data: { workers_filled: { decrement: 1 } },
        });
      }
      if (actor === "customer") {
        await transaction.customerProfile.updateMany({
          where: { user_id: userId },
          data: { cancellation_count: { increment: 1 } },
        });
      } else if (preview.reliabilityDelta) {
        const profile = await transaction.workerProfile.findUnique({
          where: { user_id: userId },
        });
        if (profile) {
          await transaction.workerProfile.update({
            where: { user_id: userId },
            data: {
              reliability_score: Math.max(
                0,
                Number(profile.reliability_score) +
                  preview.reliabilityDelta / 100,
              ),
              cancellation_rate_bps: { increment: 100 },
            },
          });
        }
      }
      await transaction.auditLog.create({
        data: {
          actor_user_id: userId,
          action: preview.addsStrike
            ? "CANCELLATION_STRIKE"
            : "ASSIGNMENT_CANCELLED",
          entity: "Assignment",
          entity_id: assignmentId,
          after_json: { ...preview, reasonCode: input.reasonCode },
        },
      });
      if (preview.needsAdminReview) {
        await transaction.report.create({
          data: {
            reporter_user_id: userId,
            target_type: "ASSIGNMENT_CANCELLATION",
            target_id: assignmentId,
            reason_code: input.reasonCode,
            description: input.note,
          },
        });
      }
      if (preview.addsStrike && previousStrikes + 1 >= 3) {
        await transaction.user.update({
          where: { id: userId },
          data: { status: UserStatus.SUSPENDED },
        });
      }
    });
    const otherUserId =
      actor === "customer"
        ? assignment.worker_user_id
        : assignment.job.poster_user_id;
    await this.notifications?.create({
      userId: otherUserId,
      type: "ASSIGNMENT_CANCELLED",
      title: "কাজ বাতিল হয়েছে",
      body: `${assignment.job.title} কাজটি বাতিল হয়েছে। বিস্তারিত দেখুন।`,
      payload: { route: "/assignments", assignmentId },
      dedupeKey: `assignment:${assignmentId}:cancelled`,
    });
    return { id: assignmentId, status: AssignmentStatus.CANCELLED, preview };
  }

  async acceptApplication(
    posterUserId: string,
    applicationId: string,
    input: AcceptApplicationDto,
  ) {
    const settings = await this.assignmentSettings();
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: true },
    });
    if (!application || application.job.poster_user_id !== posterUserId) {
      throw new NotFoundException();
    }
    if (application.status !== ApplicationStatus.PENDING) {
      throw new ConflictException("Application is no longer pending.");
    }
    if (!application.proposed_starts_at || !application.proposed_ends_at) {
      throw new BadRequestException("Application has no proposed slot.");
    }
    const price =
      toBigInt(input.agreedPricePoisha) ??
      application.proposed_price_poisha ??
      application.job.budget_max_poisha ??
      application.job.budget_min_poisha;
    if (price === null) {
      throw new BadRequestException("An agreed price is required.");
    }
    const assignment = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${application.job_id}))`,
        );
        const lockedJob = await transaction.job.findUniqueOrThrow({
          where: { id: application.job_id },
        });
        if (lockedJob.workers_filled >= lockedJob.workers_required) {
          throw new ConflictException("All worker slots are already filled.");
        }
        const accepted = await transaction.application.updateMany({
          where: { id: applicationId, status: ApplicationStatus.PENDING },
          data: {
            status: ApplicationStatus.ACCEPTED,
            responded_at: new Date(),
          },
        });
        if (accepted.count !== 1) {
          throw new ConflictException("Application is no longer pending.");
        }
        const selected = await this.states.transitionInTransaction(
          transaction,
          lockedJob,
          JobStatus.WORKER_SELECTED,
          { type: JobActorType.POSTER, userId: posterUserId },
        );
        const created = await transaction.assignment.create({
          data: {
            job_id: application.job_id,
            worker_user_id: application.worker_user_id,
            application_id: application.id,
            agreed_price_poisha: price,
            agreed_starts_at: application.proposed_starts_at,
            agreed_ends_at: application.proposed_ends_at,
            confirmation_deadline_at: new Date(
              this.now().getTime() + settings.confirmWindowMinutes * 60_000,
            ),
          },
        });
        await createContractSnapshot(transaction, {
          assignmentId: created.id,
          job: lockedJob,
          workerUserId: application.worker_user_id,
          agreedPricePoisha: price,
          agreedStartsAt: application.proposed_starts_at!,
          agreedEndsAt: application.proposed_ends_at!,
        });
        await this.states.transitionInTransaction(
          transaction,
          selected,
          JobStatus.CONFIRMATION_PENDING,
          { type: JobActorType.SYSTEM },
        );
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.notifications?.create({
      userId: application.worker_user_id,
      type: "APPLICATION_ACCEPTED",
      title: "আবেদন গ্রহণ করা হয়েছে",
      body: `${application.job.title} কাজের জন্য আপনাকে নির্বাচিত করা হয়েছে। বুকিং নিশ্চিত করুন।`,
      payload: { route: "/assignments", assignmentId: assignment.id },
      dedupeKey: `assignment:${assignment.id}:accepted`,
    });
    return serializeAssignment(assignment);
  }

  async createBookingRequest(
    posterUserId: string,
    workerUserId: string,
    input: CreateBookingRequestDto,
  ) {
    const settings = await this.assignmentSettings();
    if (posterUserId === workerUserId) {
      throw new BadRequestException("You cannot book yourself.");
    }
    const window = requiredWindow(input.startsAt, input.endsAt);
    const result = await this.availability.evaluate(workerUserId, window, 1);
    if (!result.isAvailable) {
      throw new ConflictException("Worker is not available for this slot.");
    }
    const price = BigInt(input.offeredPricePoisha);
    const assignment = await this.prisma.$transaction(async (transaction) => {
      const job = await transaction.job.create({
        data: {
          poster_user_id: posterUserId,
          title: input.title.trim(),
          description: input.description.trim(),
          category_id: input.categoryId,
          job_type: JobType.SERVICE_BOOKING,
          payment_model: PaymentModel.FIXED,
          budget_min_poisha: price,
          budget_max_poisha: price,
          location_id: input.locationId,
          starts_at: window.startsAt,
          ends_at: window.endsAt,
          skills: input.skillId
            ? { create: [{ skill_id: input.skillId }] }
            : undefined,
        },
      });
      await this.states.recordInitialDraft(transaction, job.id, posterUserId);
      const published = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.PUBLISHED,
        { type: JobActorType.POSTER, userId: posterUserId },
      );
      await transaction.job.update({
        where: { id: job.id },
        data: { published_at: new Date(), expires_at: window.startsAt },
      });
      const opened = await this.states.transitionInTransaction(
        transaction,
        published,
        JobStatus.APPLICATIONS_OPEN,
        { type: JobActorType.SYSTEM },
      );
      const application = await transaction.application.create({
        data: {
          job_id: job.id,
          worker_user_id: workerUserId,
          status: ApplicationStatus.ACCEPTED,
          proposed_price_poisha: price,
          proposed_starts_at: window.startsAt,
          proposed_ends_at: window.endsAt,
          responded_at: new Date(),
        },
      });
      const selected = await this.states.transitionInTransaction(
        transaction,
        opened,
        JobStatus.WORKER_SELECTED,
        { type: JobActorType.POSTER, userId: posterUserId },
      );
      const assignment = await transaction.assignment.create({
        data: {
          job_id: job.id,
          worker_user_id: workerUserId,
          application_id: application.id,
          agreed_price_poisha: price,
          agreed_starts_at: window.startsAt,
          agreed_ends_at: window.endsAt,
          confirmation_deadline_at: new Date(
            this.now().getTime() + settings.confirmWindowMinutes * 60_000,
          ),
        },
      });
      await createContractSnapshot(transaction, {
        assignmentId: assignment.id,
        job,
        workerUserId,
        agreedPricePoisha: price,
        agreedStartsAt: window.startsAt,
        agreedEndsAt: window.endsAt,
      });
      await this.states.transitionInTransaction(
        transaction,
        selected,
        JobStatus.CONFIRMATION_PENDING,
        { type: JobActorType.SYSTEM },
      );
      return assignment;
    });
    await this.notifications?.create({
      userId: workerUserId,
      type: "BOOKING_REQUESTED",
      title: "নতুন বুকিং অনুরোধ",
      body: `${input.title.trim()} কাজের নতুন বুকিং অনুরোধ এসেছে। সময় দেখে নিশ্চিত করুন।`,
      payload: { route: "/assignments", assignmentId: assignment.id },
      dedupeKey: `assignment:${assignment.id}:booking`,
    });
    return serializeAssignment(assignment);
  }

  async confirmAssignment(workerUserId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.worker_user_id !== workerUserId) {
      throw new NotFoundException();
    }
    if (assignment.status !== AssignmentStatus.PENDING_CONFIRMATION) {
      throw new ConflictException(
        "Assignment is no longer awaiting confirmation.",
      );
    }
    if (
      assignment.confirmation_deadline_at &&
      this.now() > assignment.confirmation_deadline_at
    ) {
      await this.expirePendingAssignment(
        assignment,
        "Confirmation window expired",
      );
      throw new ConflictException("The confirmation window has expired.");
    }
    if (!assignment.agreed_starts_at || !assignment.agreed_ends_at) {
      throw new BadRequestException("Assignment has no agreed slot.");
    }
    const availability = await this.availability.evaluate(
      workerUserId,
      {
        startsAt: assignment.agreed_starts_at,
        endsAt: assignment.agreed_ends_at,
      },
      1,
    );
    if (!availability.isAvailable) {
      throw new ConflictException("This slot is no longer available.");
    }
    const updated = await this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${workerUserId}))`,
        );
        const conflict = await transaction.assignment.findFirst({
          where: {
            id: { not: assignmentId },
            worker_user_id: workerUserId,
            status: AssignmentStatus.CONFIRMED,
            agreed_starts_at: {
              not: null,
              lt: new Date(assignment.agreed_ends_at!.getTime() + 30 * 60_000),
            },
            agreed_ends_at: {
              not: null,
              gt: new Date(
                assignment.agreed_starts_at!.getTime() - 30 * 60_000,
              ),
            },
          },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException("This slot is no longer available.");
        }
        const confirmed = await transaction.assignment.updateMany({
          where: {
            id: assignmentId,
            status: AssignmentStatus.PENDING_CONFIRMATION,
          },
          data: {
            status: AssignmentStatus.CONFIRMED,
            confirmed_at: this.now(),
          },
        });
        if (confirmed.count !== 1) {
          throw new ConflictException(
            "Assignment is no longer awaiting confirmation.",
          );
        }
        const result = await transaction.assignment.findUniqueOrThrow({
          where: { id: assignmentId },
        });
        const job = await transaction.job.findUniqueOrThrow({
          where: { id: assignment.job_id },
        });
        if (job.workers_filled >= job.workers_required) {
          throw new ConflictException("All worker slots are already filled.");
        }
        await this.states.transitionInTransaction(
          transaction,
          job,
          JobStatus.CONFIRMED,
          { type: JobActorType.WORKER, userId: workerUserId },
        );
        await createContractSnapshot(transaction, {
          assignmentId: result.id,
          job,
          workerUserId,
          agreedPricePoisha: result.agreed_price_poisha,
          agreedStartsAt: result.agreed_starts_at!,
          agreedEndsAt: result.agreed_ends_at!,
        });
        await transaction.job.update({
          where: { id: assignment.job_id },
          data: {
            workers_filled: { increment: 1 },
          },
        });
        return result;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (this.notifications) {
      const confirmedJob = await this.prisma.job.findUnique({
        where: { id: assignment.job_id },
        select: { poster_user_id: true, title: true },
      });
      if (confirmedJob)
        await this.notifications.create({
          userId: confirmedJob.poster_user_id,
          type: "ASSIGNMENT_CONFIRMED",
          title: "বুকিং নিশ্চিত হয়েছে",
          body: `কর্মী ${confirmedJob.title} কাজটি নিশ্চিত করেছেন।`,
          payload: { route: "/assignments", assignmentId: assignment.id },
          dedupeKey: `assignment:${assignment.id}:confirmed`,
        });
    }
    await this.chat?.systemMessageForJob(
      assignment.job_id,
      workerUserId,
      "কাজটি নিশ্চিত হয়েছে। এখন দুই পক্ষ এখানে নিরাপদে কথা বলতে পারবেন।",
    );
    return serializeAssignment(updated);
  }

  async declineAssignment(workerUserId: string, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.worker_user_id !== workerUserId) {
      throw new NotFoundException();
    }
    if (assignment.status !== AssignmentStatus.PENDING_CONFIRMATION) {
      throw new ConflictException(
        "Assignment is no longer awaiting confirmation.",
      );
    }
    await this.expirePendingAssignment(assignment, "Worker declined");
    return { id: assignmentId, status: AssignmentStatus.DECLINED };
  }

  private async expirePendingAssignment(
    assignment: { id: string; job_id: string; application_id: string },
    reason: string,
  ) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const changed = await transaction.assignment.updateMany({
        where: {
          id: assignment.id,
          status: AssignmentStatus.PENDING_CONFIRMATION,
        },
        data: { status: AssignmentStatus.DECLINED, cancel_reason: reason },
      });
      if (changed.count !== 1) return null;
      await transaction.application.update({
        where: { id: assignment.application_id },
        data: { status: ApplicationStatus.EXPIRED },
      });
      const job = await transaction.job.findUniqueOrThrow({
        where: { id: assignment.job_id },
      });
      if (job.status === JobStatus.CONFIRMATION_PENDING) {
        await this.states.transitionInTransaction(
          transaction,
          job,
          JobStatus.APPLICATIONS_OPEN,
          {
            type:
              reason === "Worker declined"
                ? JobActorType.WORKER
                : JobActorType.SYSTEM,
          },
          reason,
        );
      }
      return job;
    });
    if (result) {
      await this.notifications?.create({
        userId: result.poster_user_id,
        type: "ASSIGNMENT_DECLINED",
        title: "কর্মী কাজটি নিশ্চিত করেননি",
        body: `${result.title} কাজটি আবার আবেদনের জন্য খোলা হয়েছে।`,
        payload: { route: "/jobs", jobId: result.id },
        dedupeKey: `assignment:${assignment.id}:declined`,
      });
    }
  }

  async reconcileDueAssignments(userId?: string) {
    const now = this.now();
    const participantWhere = userId
      ? {
          OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
        }
      : {};
    const pending = await this.prisma.assignment.findMany({
      where: {
        status: AssignmentStatus.PENDING_CONFIRMATION,
        confirmation_deadline_at: { lte: now },
        ...participantWhere,
      },
      select: { id: true, job_id: true, application_id: true },
    });
    for (const item of pending) {
      await this.expirePendingAssignment(item, "Confirmation window expired");
    }

    const active = await this.prisma.assignment.findMany({
      where: {
        status: AssignmentStatus.CONFIRMED,
        ...participantWhere,
      },
      include: { job: true },
    });
    for (const item of active) {
      if (
        item.completion_due_at &&
        item.completion_due_at <= now &&
        item.job.status === JobStatus.CUSTOMER_REVIEW
      ) {
        const dispute = await this.prisma.dispute.findFirst({
          where: { assignment_id: item.id, status: { not: "CLOSED" } },
          select: { id: true },
        });
        if (!dispute) await this.finishAssignment(item.id, JobActorType.SYSTEM);
      } else {
        await this.prisma.$transaction(async (transaction) => {
          const job = await transaction.job.findUniqueOrThrow({
            where: { id: item.job_id },
          });
          await this.advanceForTime(transaction, job, item, now);
        });
        if (
          item.submitted_at &&
          item.job.status === JobStatus.CUSTOMER_REVIEW
        ) {
          const elapsedHours =
            (now.getTime() - item.submitted_at.getTime()) / 3_600_000;
          for (const hour of [24, 44]) {
            if (elapsedHours >= hour) {
              await this.notifications?.create({
                userId: item.job.poster_user_id,
                type: "WORK_REVIEW_REMINDER",
                title: "কাজটি পর্যালোচনার অপেক্ষায়",
                body: `${item.job.title} কাজটি পর্যালোচনা করে নিশ্চিত করুন।`,
                payload: { route: "/assignments", assignmentId: item.id },
                dedupeKey: `assignment:${item.id}:review:${hour}h`,
              });
            }
          }
        }
      }
    }
  }

  private async advanceForTime(
    transaction: Prisma.TransactionClient,
    initialJob: Job,
    assignment: { agreed_starts_at: Date | null },
    now: Date,
  ) {
    if (!assignment.agreed_starts_at) return initialJob;
    let job = initialJob;
    if (
      job.status === JobStatus.CONFIRMED &&
      now.getTime() >= assignment.agreed_starts_at.getTime() - 24 * 3_600_000
    ) {
      job = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.UPCOMING,
        { type: JobActorType.SYSTEM },
      );
    }
    if (
      job.status === JobStatus.UPCOMING &&
      now >= assignment.agreed_starts_at
    ) {
      job = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.IN_PROGRESS,
        { type: JobActorType.SYSTEM },
      );
    }
    return job;
  }

  private async finishAssignment(
    assignmentId: string,
    actorType: JobActorType,
    actorUserId?: string,
  ) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const assignment = await transaction.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
      });
      const job = await transaction.job.findUniqueOrThrow({
        where: { id: assignment.job_id },
      });
      if (job.status !== JobStatus.CUSTOMER_REVIEW) {
        throw new ConflictException("Work is not awaiting completion review.");
      }
      const completed = await this.states.transitionInTransaction(
        transaction,
        job,
        JobStatus.COMPLETED,
        { type: actorType, userId: actorUserId },
      );
      await this.states.transitionInTransaction(
        transaction,
        completed,
        JobStatus.PAYMENT_RELEASED,
        { type: JobActorType.SYSTEM },
        "Payments disabled; completion recorded",
      );
      await transaction.job.update({
        where: { id: job.id },
        data: { completed_at: this.now() },
      });
      return transaction.assignment.update({
        where: { id: assignmentId },
        data: { status: AssignmentStatus.COMPLETED },
      });
    });
    return serializeAssignment(result);
  }

  private participantAssignment(userId: string, assignmentId: string) {
    return this.prisma.assignment.findFirstOrThrow({
      where: {
        id: assignmentId,
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: { job: true },
    });
  }

  private cancellationActor(
    userId: string,
    assignment: { worker_user_id: string; job: { poster_user_id: string } },
  ): CancellationActor {
    if (assignment.job.poster_user_id === userId) return "customer";
    if (assignment.worker_user_id === userId) return "worker";
    throw new NotFoundException();
  }

  private async assignmentSettings() {
    const setting = await this.prisma.configSetting.findUnique({
      where: { key: "assignment.settings" },
    });
    const value = asRecord(setting?.value_json);
    return {
      confirmWindowMinutes: integerValue(value?.confirmWindowMinutes) ?? 120,
      autoConfirmHours: integerValue(value?.autoConfirmHours) ?? 48,
    };
  }

  private async cancellationPolicy(): Promise<CancellationPolicy> {
    const setting = await this.prisma.configSetting.findUnique({
      where: { key: "cancellation.policy" },
    });
    const value = setting?.value_json;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaultCancellationPolicy;
    }
    return value as unknown as CancellationPolicy;
  }

  private async ownedJob(posterUserId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, poster_user_id: posterUserId, deleted_at: null },
    });
    if (!job) throw new NotFoundException();
    return job;
  }
}

function parseWindow(startsAt?: string, endsAt?: string) {
  if (!startsAt && !endsAt) return undefined;
  if (!startsAt || !endsAt) {
    throw new BadRequestException("Both slot start and end are required.");
  }
  return requiredWindow(startsAt, endsAt);
}

function requiredWindow(startsAt: string, endsAt: string) {
  const window = { startsAt: new Date(startsAt), endsAt: new Date(endsAt) };
  if (window.endsAt <= window.startsAt) {
    throw new BadRequestException("Slot end must be after its start.");
  }
  return window;
}

function parseTime(value: string): Date {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

function toBigInt(value?: string): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}

function validatePublishable(job: Job): void {
  if (job.title.trim().length < 5 || job.title.trim().length > 80) {
    throw new BadRequestException(
      "Published job titles must be 5–80 characters.",
    );
  }
  if (job.description.trim().length < 20) {
    throw new BadRequestException(
      "Published job descriptions must be at least 20 characters.",
    );
  }
  if (job.workers_required < 1 || job.workers_required > 20) {
    throw new BadRequestException("Published jobs require 1–20 workers.");
  }
  if (job.starts_at && job.starts_at.getTime() < Date.now() + 30 * 60_000) {
    throw new BadRequestException(
      "A job must start at least 30 minutes from now.",
    );
  }
  if (job.starts_at && job.ends_at) {
    const duration = job.ends_at.getTime() - job.starts_at.getTime();
    if (duration <= 0 || duration > 24 * 60 * 60_000) {
      throw new BadRequestException(
        "A job occurrence must be longer than zero and at most 24 hours.",
      );
    }
  }
  if (
    job.budget_min_poisha !== null &&
    job.budget_max_poisha !== null &&
    job.budget_max_poisha < job.budget_min_poisha
  ) {
    throw new BadRequestException(
      "Maximum budget cannot be below minimum budget.",
    );
  }
}

async function createContractSnapshot(
  transaction: Prisma.TransactionClient,
  input: {
    assignmentId: string;
    job: Job;
    workerUserId: string;
    agreedPricePoisha: bigint;
    agreedStartsAt: Date;
    agreedEndsAt: Date;
  },
) {
  const [feeSetting, cancellationSetting, identities, latestContract] =
    await Promise.all([
      transaction.configSetting.findUnique({ where: { key: "platform.fees" } }),
      transaction.configSetting.findUnique({
        where: { key: "cancellation.policy" },
      }),
      transaction.user.findMany({
        where: { id: { in: [input.job.poster_user_id, input.workerUserId] } },
        select: {
          id: true,
          profile: { select: { display_name: true, trust_level: true } },
        },
      }),
      transaction.contract.findFirst({
        where: { assignment_id: input.assignmentId },
        orderBy: { version: "desc" },
        select: { version: true },
      }),
    ]);
  const version = (latestContract?.version ?? 0) + 1;
  const feeConfig = asRecord(feeSetting?.value_json);
  const feeBps = integerValue(feeConfig?.feeBps) ?? 800;
  const platformFee =
    (input.agreedPricePoisha * BigInt(feeBps) + 5_000n) / 10_000n;
  const cancellationPolicy =
    cancellationSetting?.value_json ?? ({ tiers: [] } as Prisma.JsonObject);
  const identity = (id: string) => {
    const user = identities.find((item) => item.id === id);
    return {
      userId: id,
      displayName: user?.profile?.display_name ?? null,
      trustLevel: user?.profile?.trust_level ?? "NONE",
    };
  };
  const snapshot: Prisma.JsonObject = {
    version,
    job: {
      id: input.job.id,
      title: input.job.title,
      description: input.job.description,
      categoryId: input.job.category_id,
      subcategoryId: input.job.subcategory_id,
      jobType: input.job.job_type,
      paymentModel: input.job.payment_model,
      locationId: input.job.location_id,
      areaLabel: input.job.area_label,
    },
    agreed: {
      pricePoisha: input.agreedPricePoisha.toString(),
      startsAt: input.agreedStartsAt.toISOString(),
      endsAt: input.agreedEndsAt.toISOString(),
      currency: input.job.currency,
    },
    fee: {
      feeBps,
      platformFeePoisha: platformFee.toString(),
      workerEarningPoisha: (input.agreedPricePoisha - platformFee).toString(),
    },
    parties: {
      poster: identity(input.job.poster_user_id),
      worker: identity(input.workerUserId),
    },
    cancellationPolicy,
  };
  return transaction.contract.create({
    data: {
      assignment_id: input.assignmentId,
      version,
      snapshot_json: snapshot,
      platform_fee_poisha: platformFee,
      worker_earning_poisha: input.agreedPricePoisha - platformFee,
      cancellation_policy_json: cancellationPolicy,
    },
  });
}

function asRecord(value: Prisma.JsonValue | undefined) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function integerValue(value: Prisma.JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isInteger(value)
    ? value
    : undefined;
}

function serializeJob<T extends Record<string, unknown>>(job: T) {
  return JSON.parse(
    JSON.stringify(job, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  ) as T;
}

function serializeApplication(application: {
  id: string;
  job_id: string;
  worker_user_id: string;
  status: ApplicationStatus;
  message: string | null;
  proposed_price_poisha: bigint | null;
  proposed_starts_at: Date | null;
  proposed_ends_at: Date | null;
}) {
  return {
    id: application.id,
    jobId: application.job_id,
    workerUserId: application.worker_user_id,
    status: application.status,
    message: application.message,
    proposedPricePoisha: application.proposed_price_poisha?.toString() ?? null,
    proposedStartsAt: application.proposed_starts_at?.toISOString() ?? null,
    proposedEndsAt: application.proposed_ends_at?.toISOString() ?? null,
  };
}

function serializeAssignment(assignment: {
  id: string;
  job_id: string;
  worker_user_id: string;
  status: AssignmentStatus;
  agreed_price_poisha: bigint;
  agreed_starts_at: Date | null;
  agreed_ends_at: Date | null;
}) {
  return {
    id: assignment.id,
    jobId: assignment.job_id,
    workerUserId: assignment.worker_user_id,
    status: assignment.status,
    agreedPricePoisha: assignment.agreed_price_poisha.toString(),
    agreedStartsAt: assignment.agreed_starts_at?.toISOString() ?? null,
    agreedEndsAt: assignment.agreed_ends_at?.toISOString() ?? null,
  };
}
