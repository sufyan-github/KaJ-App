import { ConflictException } from "@nestjs/common";
import { AssignmentStatus } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AvailabilityService } from "../src/modules/availability/availability.service";
import { JobsService } from "../src/modules/jobs/jobs.service";
import { Clock } from "../src/common/time/clock";

describe("JobsService slot confirmation", () => {
  const assignmentFindUnique = jest.fn();
  const assignmentFindFirst = jest.fn();
  const assignmentUpdateMany = jest.fn();
  const assignmentFindUniqueOrThrow = jest.fn();
  const jobUpdate = jest.fn();
  const jobFindUniqueOrThrow = jest.fn();
  const historyCreate = jest.fn();
  const executeRaw = jest.fn();
  const contractCreate = jest.fn();
  const transactionClient = {
    $executeRaw: executeRaw,
    assignment: {
      findFirst: assignmentFindFirst,
      updateMany: assignmentUpdateMany,
      findUniqueOrThrow: assignmentFindUniqueOrThrow,
    },
    job: { update: jobUpdate, findUniqueOrThrow: jobFindUniqueOrThrow },
    jobStatusHistory: { create: historyCreate },
    configSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    contract: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: contractCreate,
    },
  };
  const prisma = {
    assignment: { findUnique: assignmentFindUnique },
    $transaction: jest.fn((callback) => callback(transactionClient)),
  } as unknown as PrismaService;
  const availability = {
    evaluate: jest.fn(),
  } as unknown as AvailabilityService;
  const service = new JobsService(prisma, availability);

  beforeEach(() => {
    jest.clearAllMocks();
    assignmentFindUnique.mockResolvedValue({
      id: "assignment-id",
      job_id: "job-id",
      worker_user_id: "worker-id",
      status: AssignmentStatus.PENDING_CONFIRMATION,
      agreed_price_poisha: 10000n,
      agreed_starts_at: new Date("2026-09-03T08:00:00Z"),
      agreed_ends_at: new Date("2026-09-03T10:00:00Z"),
    });
    (availability.evaluate as jest.Mock).mockResolvedValue({
      isAvailable: true,
    });
    executeRaw.mockResolvedValue(1);
    assignmentFindFirst.mockResolvedValue(null);
    assignmentUpdateMany.mockResolvedValue({ count: 1 });
    assignmentFindUniqueOrThrow.mockResolvedValue({
      id: "assignment-id",
      job_id: "job-id",
      worker_user_id: "worker-id",
      status: AssignmentStatus.CONFIRMED,
      agreed_price_poisha: 10000n,
      agreed_starts_at: new Date("2026-09-03T08:00:00Z"),
      agreed_ends_at: new Date("2026-09-03T10:00:00Z"),
    });
    jobUpdate.mockResolvedValue({});
    jobFindUniqueOrThrow.mockResolvedValue({
      id: "job-id",
      status: "CONFIRMATION_PENDING",
      workers_filled: 0,
      workers_required: 1,
    });
    historyCreate.mockResolvedValue({});
    contractCreate.mockResolvedValue({ id: "contract-id", version: 1 });
  });

  it("confirms a free slot under the worker-scoped transaction lock", async () => {
    const result = await service.confirmAssignment(
      "worker-id",
      "assignment-id",
    );

    expect(executeRaw).toHaveBeenCalledTimes(1);
    expect(assignmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: AssignmentStatus.PENDING_CONFIRMATION,
        }),
      }),
    );
    expect(result.status).toBe(AssignmentStatus.CONFIRMED);
  });

  it("rejects confirmation when another confirmed assignment owns the slot", async () => {
    assignmentFindFirst.mockResolvedValue({ id: "existing-assignment" });

    await expect(
      service.confirmAssignment("worker-id", "assignment-id"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(assignmentUpdateMany).not.toHaveBeenCalled();
  });
});

describe("JobsService confirmation deadline", () => {
  it("expires and reopens an assignment outside the injected confirmation window", async () => {
    const assignmentUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const applicationUpdate = jest.fn().mockResolvedValue({});
    const jobUpdate = jest.fn().mockResolvedValue({
      id: "job-id",
      status: "APPLICATIONS_OPEN",
      workers_filled: 0,
      workers_required: 1,
    });
    const transaction = {
      assignment: { updateMany: assignmentUpdateMany },
      application: { update: applicationUpdate },
      job: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "job-id",
          poster_user_id: "poster-id",
          title: "Test job",
          status: "CONFIRMATION_PENDING",
          workers_filled: 0,
          workers_required: 1,
        }),
        update: jobUpdate,
      },
      jobStatusHistory: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      assignment: {
        findUnique: jest.fn().mockResolvedValue({
          id: "assignment-id",
          job_id: "job-id",
          application_id: "application-id",
          worker_user_id: "worker-id",
          status: "PENDING_CONFIRMATION",
          confirmation_deadline_at: new Date("2026-09-02T09:00:00Z"),
        }),
      },
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService;
    const availability = {
      evaluate: jest.fn(),
    } as unknown as AvailabilityService;
    const clock = {
      now: () => new Date("2026-09-02T10:00:00Z"),
    } satisfies Clock;
    const service = new JobsService(
      prisma,
      availability,
      undefined,
      undefined,
      clock,
    );

    await expect(
      service.confirmAssignment("worker-id", "assignment-id"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(assignmentUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DECLINED" }),
      }),
    );
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "APPLICATIONS_OPEN" },
      }),
    );
    expect(availability.evaluate).not.toHaveBeenCalled();
  });
});
