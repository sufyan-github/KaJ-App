import { JobActorType, JobStatus } from "@prisma/client";

import {
  InvalidJobTransitionError,
  JobStateChangedError,
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
    [JobStatus.COMPLETED, JobStatus.PAYMENT_RECORDED, JobActorType.POSTER],
    [JobStatus.PAYMENT_RECORDED, JobStatus.REVIEWED, JobActorType.SYSTEM],
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
    const jobUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const jobFind = jest.fn().mockResolvedValue({
      id: "job-id",
      status: JobStatus.PUBLISHED,
      workers_filled: 0,
      workers_required: 1,
    });
    const historyCreate = jest.fn().mockResolvedValue({});
    const transaction = {
      job: { updateMany: jobUpdateMany, findUniqueOrThrow: jobFind },
      jobStatusHistory: { create: historyCreate },
    } as never;

    const updated = await machine.transitionInTransaction(
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

    expect(updated.status).toBe(JobStatus.PUBLISHED);
    expect(jobUpdateMany).toHaveBeenCalledWith({
      where: { id: "job-id", status: JobStatus.DRAFT },
      data: { status: JobStatus.PUBLISHED },
    });
    expect(historyCreate).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        from_status: JobStatus.DRAFT,
        to_status: JobStatus.PUBLISHED,
      }),
    });
  });

  it("refuses the transition when another request changed the job first", async () => {
    const historyCreate = jest.fn();
    const transaction = {
      job: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
      jobStatusHistory: { create: historyCreate },
    } as never;

    await expect(
      machine.transitionInTransaction(
        transaction,
        {
          id: "job-id",
          status: JobStatus.DRAFT,
          workers_filled: 0,
          workers_required: 1,
        },
        JobStatus.PUBLISHED,
        { type: JobActorType.POSTER, userId: "poster-id" },
      ),
    ).rejects.toBeInstanceOf(JobStateChangedError);
    expect(historyCreate).not.toHaveBeenCalled();
  });

  it.each([
    JobStatus.IN_PROGRESS,
    JobStatus.SUBMITTED,
    JobStatus.COMPLETED,
    JobStatus.PAYMENT_RECORDED,
  ])("lets either party open a dispute from %s", (from) => {
    expect(() =>
      machine.assertAllowed(from, JobStatus.DISPUTED, JobActorType.POSTER),
    ).not.toThrow();
    expect(() =>
      machine.assertAllowed(from, JobStatus.DISPUTED, JobActorType.WORKER),
    ).not.toThrow();
  });

  it("lets an admin settle a dispute only into a terminal outcome", () => {
    for (const to of [
      JobStatus.COMPLETED,
      JobStatus.PAYMENT_RECORDED,
      JobStatus.CANCELLED_BY_CUSTOMER,
      JobStatus.CANCELLED_BY_WORKER,
    ])
      expect(() =>
        machine.assertAllowed(JobStatus.DISPUTED, to, JobActorType.ADMIN),
      ).not.toThrow();
    expect(() =>
      machine.assertAllowed(
        JobStatus.DISPUTED,
        JobStatus.APPLICATIONS_OPEN,
        JobActorType.ADMIN,
      ),
    ).toThrow(InvalidJobTransitionError);
  });

  it("lets only the customer close an in-progress job (no-show)", () => {
    expect(() =>
      machine.assertAllowed(
        JobStatus.IN_PROGRESS,
        JobStatus.CANCELLED_BY_CUSTOMER,
        JobActorType.POSTER,
      ),
    ).not.toThrow();
    expect(() =>
      machine.assertAllowed(
        JobStatus.IN_PROGRESS,
        JobStatus.CANCELLED_BY_WORKER,
        JobActorType.WORKER,
      ),
    ).toThrow(InvalidJobTransitionError);
  });
});
