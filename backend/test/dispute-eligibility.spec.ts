import { JobStatus } from "@prisma/client";

import {
  disputeEligibility,
  DISPUTE_ELIGIBLE_STATUSES,
} from "../src/modules/disputes/dispute-eligibility";

describe("dispute eligibility", () => {
  const completedAt = new Date("2026-11-10T10:00:00Z");
  const base = {
    jobStatus: JobStatus.PAYMENT_RECORDED,
    jobCompletedAt: completedAt,
    submittedAt: null,
    jobUpdatedAt: completedAt,
    hasDispute: false,
    now: new Date("2026-11-12T10:00:00Z"),
  };

  it("allows a dispute within seven days of completion, cash recorded or not", () => {
    for (const jobStatus of [JobStatus.COMPLETED, JobStatus.PAYMENT_RECORDED])
      expect(disputeEligibility({ ...base, jobStatus })).toEqual({
        canDispute: true,
        disputeWindowEndsAt: new Date("2026-11-17T10:00:00Z"),
        reason: null,
      });
  });

  it("closes the window after seven days", () => {
    expect(
      disputeEligibility({ ...base, now: new Date("2026-11-17T10:00:01Z") }),
    ).toMatchObject({ canDispute: false, reason: "DISPUTE_WINDOW_CLOSED" });
  });

  it.each(
    Object.values(JobStatus).filter(
      (status) => !DISPUTE_ELIGIBLE_STATUSES.includes(status),
    ),
  )("refuses a %s job", (jobStatus) => {
    expect(disputeEligibility({ ...base, jobStatus })).toEqual({
      canDispute: false,
      disputeWindowEndsAt: null,
      reason: "DISPUTE_NOT_ELIGIBLE",
    });
  });

  it("refuses a second dispute", () => {
    expect(disputeEligibility({ ...base, hasDispute: true })).toMatchObject({
      canDispute: false,
      reason: "DISPUTE_EXISTS",
    });
  });

  it("starts the window at submission when the job is not completed yet", () => {
    expect(
      disputeEligibility({
        ...base,
        jobStatus: JobStatus.CUSTOMER_REVIEW,
        jobCompletedAt: null,
        submittedAt: new Date("2026-11-11T10:00:00Z"),
      }).disputeWindowEndsAt,
    ).toEqual(new Date("2026-11-18T10:00:00Z"));
  });
});
