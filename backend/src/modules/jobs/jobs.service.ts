import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApplicationStatus,
  AssignmentStatus,
  JobActorType,
  JobStatus,
  JobType,
  PaymentModel,
  Prisma,
  type Job,
} from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { AvailabilityService } from "../availability/availability.service";
import {
  AcceptApplicationDto,
  ApplyToJobDto,
  CreateBookingRequestDto,
  CreateJobDto,
  JobFeedQueryDto,
} from "./dto/jobs.dto";
import { JobStateMachine } from "./state-machine/job-state.machine";

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
  ) {}

  async create(posterUserId: string, input: CreateJobDto) {
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
    return serializeJob(updated);
  }

  async feed(query: JobFeedQueryDto) {
    const jobs = await this.prisma.job.findMany({
      where: {
        status: JobStatus.APPLICATIONS_OPEN,
        deleted_at: null,
        category_id: query.categoryId,
        location_id: query.locationId,
      },
      include: jobInclude,
      orderBy: [{ is_featured: "desc" }, { published_at: "desc" }],
      take: 50,
    });
    return { items: jobs.map(serializeJob) };
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
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        status: JobStatus.APPLICATIONS_OPEN,
        deleted_at: null,
      },
    });
    if (!job) throw new NotFoundException();
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
    const assignments = await this.prisma.assignment.findMany({
      where: {
        OR: [{ worker_user_id: userId }, { job: { poster_user_id: userId } }],
      },
      include: {
        job: { select: { title: true, poster_user_id: true } },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return {
      items: assignments.map((assignment) => ({
        ...serializeAssignment(assignment),
        title: assignment.job.title,
        isWorker: assignment.worker_user_id === userId,
        isPoster: assignment.job.poster_user_id === userId,
      })),
    };
  }

  async acceptApplication(
    posterUserId: string,
    applicationId: string,
    input: AcceptApplicationDto,
  ) {
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
    return serializeAssignment(assignment);
  }

  async createBookingRequest(
    posterUserId: string,
    workerUserId: string,
    input: CreateBookingRequestDto,
  ) {
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
            confirmed_at: new Date(),
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
    return serializeAssignment(updated);
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
  const [feeSetting, cancellationSetting, identities] = await Promise.all([
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
  ]);
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
    version: 1,
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
