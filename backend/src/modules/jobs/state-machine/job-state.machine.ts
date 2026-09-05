import { ConflictException } from "@nestjs/common";
import { JobActorType, JobStatus, Prisma, type Job } from "@prisma/client";

export interface JobTransitionActor {
  type: JobActorType;
  userId?: string;
}

type TransitionKey = `${JobStatus}->${JobStatus}`;

const transitions = new Map<TransitionKey, readonly JobActorType[]>([
  [key(JobStatus.DRAFT, JobStatus.PUBLISHED), [JobActorType.POSTER]],
  [
    key(JobStatus.PUBLISHED, JobStatus.APPLICATIONS_OPEN),
    [JobActorType.SYSTEM],
  ],
  [
    key(JobStatus.APPLICATIONS_OPEN, JobStatus.WORKER_SELECTED),
    [JobActorType.POSTER],
  ],
  [
    key(JobStatus.WORKER_SELECTED, JobStatus.CONFIRMATION_PENDING),
    [JobActorType.SYSTEM],
  ],
  [
    key(JobStatus.CONFIRMATION_PENDING, JobStatus.CONFIRMED),
    [JobActorType.WORKER],
  ],
  [
    key(JobStatus.CONFIRMATION_PENDING, JobStatus.APPLICATIONS_OPEN),
    [JobActorType.SYSTEM, JobActorType.WORKER],
  ],
  [key(JobStatus.CONFIRMED, JobStatus.UPCOMING), [JobActorType.SYSTEM]],
  [key(JobStatus.UPCOMING, JobStatus.CHECKED_IN), [JobActorType.WORKER]],
  [
    key(JobStatus.UPCOMING, JobStatus.IN_PROGRESS),
    [JobActorType.WORKER, JobActorType.SYSTEM],
  ],
  [
    key(JobStatus.CHECKED_IN, JobStatus.IN_PROGRESS),
    [JobActorType.WORKER, JobActorType.SYSTEM],
  ],
  [key(JobStatus.IN_PROGRESS, JobStatus.SUBMITTED), [JobActorType.WORKER]],
  [key(JobStatus.SUBMITTED, JobStatus.CUSTOMER_REVIEW), [JobActorType.SYSTEM]],
  [
    key(JobStatus.CUSTOMER_REVIEW, JobStatus.COMPLETED),
    [JobActorType.POSTER, JobActorType.SYSTEM],
  ],
  [
    key(JobStatus.CUSTOMER_REVIEW, JobStatus.DISPUTED),
    [JobActorType.POSTER, JobActorType.WORKER],
  ],
  [key(JobStatus.COMPLETED, JobStatus.PAYMENT_RELEASED), [JobActorType.SYSTEM]],
  [
    key(JobStatus.COMPLETED, JobStatus.PAYMENT_RECORDED),
    [JobActorType.POSTER, JobActorType.SYSTEM],
  ],
  [key(JobStatus.PAYMENT_RELEASED, JobStatus.REVIEWED), [JobActorType.SYSTEM]],
  [key(JobStatus.PAYMENT_RECORDED, JobStatus.REVIEWED), [JobActorType.SYSTEM]],
  [key(JobStatus.PUBLISHED, JobStatus.EXPIRED), [JobActorType.SYSTEM]],
  [key(JobStatus.APPLICATIONS_OPEN, JobStatus.EXPIRED), [JobActorType.SYSTEM]],
  [key(JobStatus.DISPUTED, JobStatus.COMPLETED), [JobActorType.ADMIN]],
  [
    key(JobStatus.DISPUTED, JobStatus.CANCELLED_BY_CUSTOMER),
    [JobActorType.ADMIN],
  ],
  [
    key(JobStatus.DISPUTED, JobStatus.CANCELLED_BY_WORKER),
    [JobActorType.ADMIN],
  ],
]);

const preProgress = new Set<JobStatus>([
  JobStatus.DRAFT,
  JobStatus.PUBLISHED,
  JobStatus.APPLICATIONS_OPEN,
  JobStatus.WORKER_SELECTED,
  JobStatus.CONFIRMATION_PENDING,
  JobStatus.CONFIRMED,
  JobStatus.UPCOMING,
  JobStatus.CHECKED_IN,
]);

export class InvalidJobTransitionError extends ConflictException {
  constructor(from: JobStatus, to: JobStatus, actor: JobActorType) {
    super(`Invalid job transition: ${from} -> ${to} by ${actor}.`);
  }
}

export class JobStateMachine {
  async recordInitialDraft(
    transaction: Prisma.TransactionClient,
    jobId: string,
    posterUserId: string,
  ) {
    return transaction.jobStatusHistory.create({
      data: {
        job_id: jobId,
        from_status: null,
        to_status: JobStatus.DRAFT,
        actor_user_id: posterUserId,
        actor_type: JobActorType.POSTER,
      },
    });
  }

  assertAllowed(from: JobStatus, to: JobStatus, actor: JobActorType): void {
    if (to === JobStatus.SUSPENDED && actor === JobActorType.ADMIN) return;
    if (
      to === JobStatus.CANCELLED_BY_CUSTOMER &&
      actor === JobActorType.POSTER &&
      preProgress.has(from)
    ) {
      return;
    }
    if (
      to === JobStatus.CANCELLED_BY_WORKER &&
      actor === JobActorType.WORKER &&
      preProgress.has(from)
    ) {
      return;
    }
    if (!transitions.get(key(from, to))?.includes(actor)) {
      throw new InvalidJobTransitionError(from, to, actor);
    }
  }

  async transitionInTransaction(
    transaction: Prisma.TransactionClient,
    job: Pick<Job, "id" | "status" | "workers_filled" | "workers_required">,
    to: JobStatus,
    actor: JobTransitionActor,
    reason?: string,
  ) {
    this.assertAllowed(job.status, to, actor.type);
    if (job.workers_filled > job.workers_required) {
      throw new ConflictException("A job cannot overfill its worker slots.");
    }
    if (to === JobStatus.COMPLETED) {
      const assignments = await transaction.assignment.count({
        where: { job_id: job.id },
      });
      if (assignments === 0) {
        throw new ConflictException(
          "A job needs an assignment before completion.",
        );
      }
    }
    const updated = await transaction.job.update({
      where: { id: job.id },
      data: { status: to },
    });
    await transaction.jobStatusHistory.create({
      data: {
        job_id: job.id,
        from_status: job.status,
        to_status: to,
        actor_user_id: actor.userId,
        actor_type: actor.type,
        reason,
      },
    });
    return updated;
  }
}

function key(from: JobStatus, to: JobStatus): TransitionKey {
  return `${from}->${to}`;
}
