import { ConflictException } from "@nestjs/common";
import {
  ApplicationStatus,
  AssignmentStatus,
  Job,
  JobActorType,
  JobStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { JobStateMachine } from "./state-machine/job-state.machine";

/** Open statuses an owner may close, and the runner may expire. */
export const CLOSABLE: JobStatus[] = [
  JobStatus.DRAFT,
  JobStatus.PUBLISHED,
  JobStatus.APPLICATIONS_OPEN,
];
const LIVE_ASSIGNMENTS: AssignmentStatus[] = [
  AssignmentStatus.PENDING_CONFIRMATION,
  AssignmentStatus.CONFIRMED,
];

export const jobNotClosable = (status: string) =>
  new ConflictException({
    code: "JOB_NOT_CLOSABLE",
    message:
      "Only a draft or an open job with nobody booked can be closed. Cancel the booking instead.",
    messageKey: "error.job.not_closable",
    details: [{ status }],
  });

/**
 * DB-1: end an open job or learning opportunity: its status moves on through
 * the state machine (EXPIRED by the system, CANCELLED_BY_CUSTOMER by its
 * owner) and applications still waiting expire with it.
 */
export async function endOpenJob(
  prisma: PrismaClient,
  states: JobStateMachine,
  job: Pick<Job, "id" | "status" | "workers_filled" | "workers_required">,
  to: typeof JobStatus.EXPIRED | typeof JobStatus.CANCELLED_BY_CUSTOMER,
  actor: { type: JobActorType; userId?: string },
  reason: string,
) {
  return prisma.$transaction(async (transaction) => {
    const live = await transaction.assignment.count({
      where: { job_id: job.id, status: { in: LIVE_ASSIGNMENTS } },
    });
    if (live) throw jobNotClosable(job.status);
    const updated = await states.transitionInTransaction(
      transaction,
      job,
      to,
      actor,
      reason,
    );
    await transaction.application.updateMany({
      where: {
        job_id: job.id,
        status: {
          in: [ApplicationStatus.PENDING, ApplicationStatus.SHORTLISTED],
        },
      },
      data: { status: ApplicationStatus.EXPIRED },
    });
    return updated;
  });
}

/** Jobs and opportunities past their date that nobody was booked for. */
export function dueForExpiry(now: Date): Prisma.JobWhereInput {
  return {
    status: { in: [JobStatus.PUBLISHED, JobStatus.APPLICATIONS_OPEN] },
    deleted_at: null,
    expires_at: { lte: now },
    assignments: { none: { status: { in: LIVE_ASSIGNMENTS } } },
  };
}
