import { ConflictException } from "@nestjs/common";
import { AssignmentStatus } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AvailabilityService } from "../src/modules/availability/availability.service";
import { JobsService } from "../src/modules/jobs/jobs.service";

describe("JobsService slot confirmation", () => {
  const assignmentFindUnique = jest.fn();
  const assignmentFindFirst = jest.fn();
  const assignmentUpdateMany = jest.fn();
  const assignmentFindUniqueOrThrow = jest.fn();
  const jobUpdate = jest.fn();
  const jobFindUniqueOrThrow = jest.fn();
  const historyCreate = jest.fn();
  const executeRaw = jest.fn();
  const transactionClient = {
    $executeRaw: executeRaw,
    assignment: {
      findFirst: assignmentFindFirst,
      updateMany: assignmentUpdateMany,
      findUniqueOrThrow: assignmentFindUniqueOrThrow,
    },
    job: { update: jobUpdate, findUniqueOrThrow: jobFindUniqueOrThrow },
    jobStatusHistory: { create: historyCreate },
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
