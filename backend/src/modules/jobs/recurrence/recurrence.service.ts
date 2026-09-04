import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  AssignmentStatus,
  JobOccurrenceStatus,
  JobStatus,
  JobType,
  Prisma,
} from "@prisma/client";

import { CLOCK, type Clock } from "../../../common/time/clock";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import {
  type CancelOccurrenceDto,
  type UpdateJobSeriesDto,
} from "../dto/jobs.dto";
import {
  generateOccurrences,
  parseRecurrenceRule,
  recurrenceRuleJson,
} from "./recurrence";

const WINDOW_DAYS = 14;
const EDITABLE_STATUS = JobOccurrenceStatus.SCHEDULED;
const ASSIGNABLE_ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  AssignmentStatus.PENDING_CONFIRMATION,
  AssignmentStatus.CONFIRMED,
];

@Injectable()
export class RecurrenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(CLOCK) private readonly clock?: Clock,
  ) {}

  private now(): Date {
    return this.clock?.now() ?? new Date();
  }

  async assertEnabled(): Promise<void> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: "recurring_jobs_enabled" },
    });
    if (flag?.is_enabled !== true || flag.rollout_percent !== 100) {
      throw new ForbiddenException("Recurring jobs are not enabled.");
    }
  }

  async generate(jobId: string) {
    await this.assertEnabled();
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, deleted_at: null },
      select: { id: true, job_type: true, recurrence_rule: true },
    });
    if (!job) throw new NotFoundException();
    if (job.job_type !== JobType.RECURRING || !job.recurrence_rule) {
      throw new ConflictException("This job is not a recurring series.");
    }
    const now = this.now();
    const through = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
    const occurrences = generateOccurrences(
      parseRecurrenceRule(job.recurrence_rule),
      through,
    ).filter((item) => item.startsAt >= now);
    const inserted = await this.prisma.jobOccurrence.createMany({
      data: occurrences.map((item) => ({
        job_id: job.id,
        sequence_no: item.sequenceNo,
        scheduled_date: item.scheduledDate,
        starts_at: item.startsAt,
        ends_at: item.endsAt,
      })),
      skipDuplicates: true,
    });
    return { generated: inserted.count, through: through.toISOString() };
  }

  async generateAll(): Promise<{ series: number; generated: number }> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: "recurring_jobs_enabled" },
    });
    if (flag?.is_enabled !== true || flag.rollout_percent !== 100) {
      return { series: 0, generated: 0 };
    }
    const jobs = await this.prisma.job.findMany({
      where: {
        job_type: JobType.RECURRING,
        recurrence_rule: { not: Prisma.DbNull },
        status: { notIn: [JobStatus.DRAFT, JobStatus.COMPLETED] },
        deleted_at: null,
      },
      select: { id: true },
    });
    let generated = 0;
    for (const job of jobs)
      generated += (await this.generate(job.id)).generated;
    return { series: jobs.length, generated };
  }

  async list(jobId: string) {
    const items = await this.prisma.jobOccurrence.findMany({
      where: { job_id: jobId },
      include: {
        assigned_assignment: {
          select: { id: true, worker_user_id: true, status: true },
        },
      },
      orderBy: { starts_at: "asc" },
      take: 200,
    });
    return { items: items.map(serializeOccurrence) };
  }

  async mine(userId: string) {
    const items = await this.prisma.jobOccurrence.findMany({
      where: {
        OR: [
          { job: { poster_user_id: userId } },
          { assigned_assignment: { worker_user_id: userId } },
        ],
      },
      include: {
        job: { select: { id: true, title: true, poster_user_id: true } },
        assigned_assignment: {
          select: { id: true, worker_user_id: true, status: true },
        },
      },
      orderBy: { starts_at: "asc" },
      take: 200,
    });
    return { items: items.map(serializeOccurrence) };
  }

  async updateSeries(
    posterUserId: string,
    jobId: string,
    input: UpdateJobSeriesDto,
  ) {
    await this.assertEnabled();
    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        poster_user_id: posterUserId,
        job_type: JobType.RECURRING,
        deleted_at: null,
      },
      select: { id: true, recurrence_rule: true },
    });
    if (!job?.recurrence_rule) throw new NotFoundException();
    const previous = parseRecurrenceRule(job.recurrence_rule);
    const next = recurrenceRuleJson(input.recurrenceRule);
    const parsedNext = parseRecurrenceRule(
      next as unknown as Prisma.JsonObject,
    );
    if (previous.startDate !== parsedNext.startDate) {
      throw new ConflictException(
        "A series start date cannot be changed after creation.",
      );
    }
    const now = this.now();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.job.update({
        where: { id: jobId },
        data: { recurrence_rule: next },
      });
      await transaction.jobOccurrence.deleteMany({
        where: {
          job_id: jobId,
          starts_at: { gt: now },
          status: EDITABLE_STATUS,
          assigned_assignment_id: null,
        },
      });
    });
    const generation = await this.generate(jobId);
    return { jobId, recurrenceRule: next, generation };
  }

  async cancel(
    userId: string,
    occurrenceId: string,
    input: CancelOccurrenceDto,
  ) {
    const occurrence = await this.prisma.jobOccurrence.findUnique({
      where: { id: occurrenceId },
      include: {
        job: { select: { poster_user_id: true } },
        assigned_assignment: { select: { worker_user_id: true } },
      },
    });
    if (!occurrence) throw new NotFoundException();
    const isPoster = occurrence.job.poster_user_id === userId;
    const isWorker = occurrence.assigned_assignment?.worker_user_id === userId;
    if (!isPoster && !isWorker) throw new NotFoundException();
    if (occurrence.starts_at <= this.now()) {
      throw new ConflictException("Only future occurrences can be cancelled.");
    }
    if (
      occurrence.status !== JobOccurrenceStatus.SCHEDULED &&
      occurrence.status !== JobOccurrenceStatus.ASSIGNED
    ) {
      throw new ConflictException(
        "This occurrence can no longer be cancelled.",
      );
    }
    const updated = await this.prisma.jobOccurrence.update({
      where: { id: occurrenceId },
      data: {
        status: isPoster
          ? JobOccurrenceStatus.CANCELLED_BY_CUSTOMER
          : JobOccurrenceStatus.CANCELLED_BY_WORKER,
        cancel_reason: input.reason.trim(),
      },
    });
    return serializeOccurrence(updated);
  }

  async assign(
    posterUserId: string,
    occurrenceId: string,
    assignmentId: string,
  ) {
    const occurrence = await this.prisma.jobOccurrence.findFirst({
      where: {
        id: occurrenceId,
        job: { poster_user_id: posterUserId },
      },
    });
    if (!occurrence) throw new NotFoundException();
    if (
      occurrence.starts_at <= this.now() ||
      occurrence.status !== JobOccurrenceStatus.SCHEDULED
    ) {
      throw new ConflictException(
        "Only future scheduled occurrences can be assigned.",
      );
    }
    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        job_id: occurrence.job_id,
        status: { in: ASSIGNABLE_ASSIGNMENT_STATUSES },
      },
    });
    if (!assignment) throw new NotFoundException();
    const updated = await this.prisma.jobOccurrence.update({
      where: { id: occurrenceId },
      data: {
        assigned_assignment_id: assignment.id,
        status: JobOccurrenceStatus.ASSIGNED,
      },
    });
    return serializeOccurrence(updated);
  }
}

function serializeOccurrence(occurrence: Record<string, unknown>) {
  const value = occurrence as Record<string, any>;
  return {
    id: value.id,
    jobId: value.job_id,
    sequenceNo: value.sequence_no,
    scheduledDate: value.scheduled_date?.toISOString().slice(0, 10),
    startsAt: value.starts_at?.toISOString(),
    endsAt: value.ends_at?.toISOString(),
    status: value.status,
    assignedAssignmentId: value.assigned_assignment_id,
    cancelReason: value.cancel_reason,
    ...(value.job ? { job: value.job } : {}),
    ...(value.assigned_assignment
      ? { assignedAssignment: value.assigned_assignment }
      : {}),
  };
}
