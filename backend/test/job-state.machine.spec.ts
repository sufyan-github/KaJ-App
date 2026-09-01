import { JobActorType, JobStatus } from "@prisma/client";

import {
  InvalidJobTransitionError,
  JobStateMachine,
} from "../src/modules/jobs/state-machine/job-state.machine";

describe("JobStateMachine", () => {
  const machine = new JobStateMachine();

  it.each([
    [JobStatus.DRAFT, JobStatus.PUBLISHED, JobActorType.POSTER],
    [JobStatus.PUBLISHED, JobStatus.APPLICATIONS_OPEN, JobActorType.SYSTEM],
    [
      JobStatus.APPLICATIONS_OPEN,
      JobStatus.WORKER_SELECTED,
      JobActorType.POSTER,
    ],
    [
      JobStatus.WORKER_SELECTED,
      JobStatus.CONFIRMATION_PENDING,
      JobActorType.SYSTEM,
    ],
    [JobStatus.CONFIRMATION_PENDING, JobStatus.CONFIRMED, JobActorType.WORKER],
    [JobStatus.IN_PROGRESS, JobStatus.SUBMITTED, JobActorType.WORKER],
    [JobStatus.CUSTOMER_REVIEW, JobStatus.COMPLETED, JobActorType.POSTER],
    [JobStatus.DISPUTED, JobStatus.COMPLETED, JobActorType.ADMIN],
  ])("allows %s -> %s by %s", (from, to, actor) => {
    expect(() => machine.assertAllowed(from, to, actor)).not.toThrow();
  });

  it.each([
    [JobStatus.DRAFT, JobStatus.COMPLETED, JobActorType.POSTER],
    [JobStatus.DRAFT, JobStatus.PUBLISHED, JobActorType.WORKER],
    [JobStatus.CONFIRMED, JobStatus.APPLICATIONS_OPEN, JobActorType.POSTER],
    [JobStatus.REVIEWED, JobStatus.DRAFT, JobActorType.SYSTEM],
    [JobStatus.EXPIRED, JobStatus.APPLICATIONS_OPEN, JobActorType.SYSTEM],
    [JobStatus.CANCELLED_BY_CUSTOMER, JobStatus.PUBLISHED, JobActorType.POSTER],
  ])("rejects %s -> %s by %s", (from, to, actor) => {
    expect(() => machine.assertAllowed(from, to, actor)).toThrow(
      InvalidJobTransitionError,
    );
  });

  it("changes status and writes exactly one history row", async () => {
    const jobUpdate = jest.fn().mockResolvedValue({
      id: "job-id",
      status: JobStatus.PUBLISHED,
      workers_filled: 0,
      workers_required: 1,
    });
    const historyCreate = jest.fn().mockResolvedValue({});
    const transaction = {
      job: { update: jobUpdate },
      jobStatusHistory: { create: historyCreate },
    } as never;

    await machine.transitionInTransaction(
      transaction,
      {
        id: "job-id",
        status: JobStatus.DRAFT,
        workers_filled: 0,
        workers_required: 1,
      },
      JobStatus.PUBLISHED,
      { type: JobActorType.POSTER, userId: "poster-id" },
    );

    expect(jobUpdate).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_status: JobStatus.DRAFT,
        to_status: JobStatus.PUBLISHED,
      }),
    });
  });
});
