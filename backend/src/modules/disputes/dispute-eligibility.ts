import { JobStatus } from "@prisma/client";

/** Job statuses a party may open a dispute from. */
export const DISPUTE_ELIGIBLE_STATUSES: readonly JobStatus[] = [
  // IN_PROGRESS lets either side raise a no-show or stalled job, which had no
  // way out once the clock advanced it.
  JobStatus.IN_PROGRESS,
  JobStatus.SUBMITTED,
  JobStatus.CUSTOMER_REVIEW,
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_RECORDED,
];

export const DISPUTE_WINDOW_MS = 7 * 24 * 60 * 60_000;

export type DisputeIneligibility =
  "DISPUTE_NOT_ELIGIBLE" | "DISPUTE_WINDOW_CLOSED" | "DISPUTE_EXISTS";

export interface DisputeEligibility {
  canDispute: boolean;
  /** When the seven-day window closes; null when the status never allows one. */
  disputeWindowEndsAt: Date | null;
  /** Why not, when canDispute is false. */
  reason: DisputeIneligibility | null;
}

/**
 * The one rule for "can a party open a dispute on this assignment now",
 * shared by POST /assignments/:id/disputes and GET /assignments/:id, so the
 * app only offers the button when the server will accept it.
 */
export function disputeEligibility(input: {
  jobStatus: JobStatus;
  jobCompletedAt: Date | null;
  submittedAt: Date | null;
  jobUpdatedAt: Date;
  hasDispute: boolean;
  now: Date;
}): DisputeEligibility {
  if (input.hasDispute)
    return {
      canDispute: false,
      disputeWindowEndsAt: null,
      reason: "DISPUTE_EXISTS",
    };
  if (!DISPUTE_ELIGIBLE_STATUSES.includes(input.jobStatus))
    return {
      canDispute: false,
      disputeWindowEndsAt: null,
      reason: "DISPUTE_NOT_ELIGIBLE",
    };
  const windowStart =
    input.jobCompletedAt ?? input.submittedAt ?? input.jobUpdatedAt;
  const disputeWindowEndsAt = new Date(
    windowStart.getTime() + DISPUTE_WINDOW_MS,
  );
  return input.now.getTime() > disputeWindowEndsAt.getTime()
    ? {
        canDispute: false,
        disputeWindowEndsAt,
        reason: "DISPUTE_WINDOW_CLOSED",
      }
    : { canDispute: true, disputeWindowEndsAt, reason: null };
}

/** The error a refused dispute returns (409, same messages as before). */
export function disputeRefusal(reason: DisputeIneligibility) {
  switch (reason) {
    case "DISPUTE_EXISTS":
      return {
        code: reason,
        message: "This assignment already has a dispute.",
        messageKey: "error.dispute.exists",
      };
    case "DISPUTE_WINDOW_CLOSED":
      return {
        code: reason,
        message: "The seven-day dispute window has closed.",
        messageKey: "error.dispute.window_closed",
      };
    default:
      return {
        code: reason,
        message: "This assignment is not eligible for dispute.",
        messageKey: "error.dispute.not_eligible",
      };
  }
}
