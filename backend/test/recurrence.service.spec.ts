import { JobOccurrenceStatus, JobType } from "@prisma/client";

import { type Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RecurrenceService } from "../src/modules/jobs/recurrence/recurrence.service";

describe("RecurrenceService series edits", () => {
  const now = new Date("2026-09-05T06:00:00.000Z");
  const oldRule = {
    frequency: "WEEKLY",
    daysOfWeek: [1],
    startDate: "2026-09-01",
    startTime: "09:00",
    endTime: "11:00",
    count: 20,
    timezone: "Asia/Dhaka",
  } as const;
  const newRule = {
    ...oldRule,
    daysOfWeek: [1, 3],
  };

  it("deletes only unassigned future schedules and never mutates the past", async () => {
    const jobUpdate = jest.fn().mockResolvedValue({});
    const occurrenceDeleteMany = jest.fn().mockResolvedValue({ count: 2 });
    const transaction = {
      job: { update: jobUpdate },
      jobOccurrence: { deleteMany: occurrenceDeleteMany },
    };
    const jobFindFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: "job-id",
        recurrence_rule: oldRule,
      })
      .mockResolvedValueOnce({
        id: "job-id",
        job_type: JobType.RECURRING,
        recurrence_rule: newRule,
      });
    const createMany = jest.fn().mockResolvedValue({ count: 4 });
    const prisma = {
      featureFlag: {
        findUnique: jest.fn().mockResolvedValue({
          is_enabled: true,
          rollout_percent: 100,
        }),
      },
      job: { findFirst: jobFindFirst },
      jobOccurrence: { createMany },
      $transaction: jest.fn((callback) => callback(transaction)),
    } as unknown as PrismaService;
    const clock = { now: () => now } satisfies Clock;
    const service = new RecurrenceService(prisma, clock);

    await service.updateSeries("poster-id", "job-id", {
      recurrenceRule: newRule,
    });

    expect(occurrenceDeleteMany).toHaveBeenCalledWith({
      where: {
        job_id: "job-id",
        starts_at: { gt: now },
        status: JobOccurrenceStatus.SCHEDULED,
        assigned_assignment_id: null,
      },
    });
    expect(jobUpdate).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
  });

  it("cancels one occurrence without changing the series job", async () => {
    const occurrenceUpdate = jest.fn().mockResolvedValue({
      id: "occurrence-id",
      job_id: "job-id",
      sequence_no: 7,
      starts_at: new Date("2026-09-07T03:00:00.000Z"),
      ends_at: new Date("2026-09-07T05:00:00.000Z"),
      scheduled_date: new Date("2026-09-07T00:00:00.000Z"),
      status: JobOccurrenceStatus.CANCELLED_BY_CUSTOMER,
      assigned_assignment_id: null,
      cancel_reason: "No longer needed",
    });
    const prisma = {
      jobOccurrence: {
        findUnique: jest.fn().mockResolvedValue({
          id: "occurrence-id",
          starts_at: new Date("2026-09-07T03:00:00.000Z"),
          status: JobOccurrenceStatus.SCHEDULED,
          job: { poster_user_id: "poster-id" },
          assigned_assignment: null,
        }),
        update: occurrenceUpdate,
      },
    } as unknown as PrismaService;
    const service = new RecurrenceService(prisma, { now: () => now });

    const result = await service.cancel("poster-id", "occurrence-id", {
      reason: "No longer needed",
    });

    expect(result.status).toBe(JobOccurrenceStatus.CANCELLED_BY_CUSTOMER);
    expect(occurrenceUpdate).toHaveBeenCalledTimes(1);
  });
});
