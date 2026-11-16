import { ConflictException } from "@nestjs/common";
import { OpportunityType, Prisma } from "@prisma/client";

/**
 * The one definition of "paid work". Every work-only query — worker feed,
 * job alerts, suggestions, fees, payments, cancellation penalties,
 * reliability stats, risk scans — filters with it, so a learning
 * opportunity (TRAINING, APPRENTICESHIP) never leaks into them.
 */
export const WORK_ONLY = {
  opportunity_type: OpportunityType.WORK,
} as const satisfies Prisma.JobWhereInput;

export function isWork(job: { opportunity_type: OpportunityType }): boolean {
  return job.opportunity_type === OpportunityType.WORK;
}

/** Work routes (apply, confirm, submit, complete, pay…) on a learning row. */
export function assertWork(job: { opportunity_type: OpportunityType }) {
  if (!isWork(job))
    throw new ConflictException({
      code: "NOT_A_WORK_JOB",
      message:
        "This is a learning opportunity. Use the learning routes instead.",
      messageKey: "error.job.not_work",
    });
}
