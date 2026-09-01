import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AvailabilityService } from "../src/modules/availability/availability.service";

describe("AvailabilityService", () => {
  const ruleDeleteMany = jest.fn();
  const ruleCreateMany = jest.fn();
  const ruleFindMany = jest.fn();
  const exceptionFindMany = jest.fn();
  const exceptionCreate = jest.fn();
  const exceptionDeleteMany = jest.fn();
  const assignmentFindMany = jest.fn();
  const userFindFirst = jest.fn();
  const transaction = {
    availabilityRule: {
      createMany: ruleCreateMany,
      deleteMany: ruleDeleteMany,
    },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(transaction)),
    availabilityRule: { findMany: ruleFindMany },
    availabilityException: {
      create: exceptionCreate,
      deleteMany: exceptionDeleteMany,
      findMany: exceptionFindMany,
    },
    assignment: { findMany: assignmentFindMany },
    user: { findFirst: userFindFirst },
  } as unknown as PrismaService;
  const service = new AvailabilityService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    ruleDeleteMany.mockResolvedValue({ count: 0 });
    ruleCreateMany.mockResolvedValue({ count: 1 });
    ruleFindMany.mockResolvedValue([
      {
        id: "rule-id",
        day_of_week: 0,
        start_time: new Date("1970-01-01T16:00:00Z"),
        end_time: new Date("1970-01-01T20:00:00Z"),
      },
    ]);
    exceptionFindMany.mockResolvedValue([]);
    assignmentFindMany.mockResolvedValue([]);
    userFindFirst.mockResolvedValue({ id: "worker-id" });
  });

  it("replaces the complete weekly rule set atomically", async () => {
    const result = await service.replaceRules("user-id", [
      { dayOfWeek: 0, startTime: "16:00", endTime: "20:00" },
    ]);

    expect(ruleDeleteMany).toHaveBeenCalledWith({
      where: { user_id: "user-id" },
    });
    expect(ruleCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          user_id: "user-id",
          day_of_week: 0,
        }),
      ],
    });
    expect(result.rules[0]).toMatchObject({
      dayOfWeek: 0,
      startTime: "16:00",
      endTime: "20:00",
    });
  });

  it("rejects an exception with a non-positive window", async () => {
    await expect(
      service.createException("user-id", {
        startsAt: "2026-09-01T10:00:00Z",
        endsAt: "2026-09-01T09:00:00Z",
      }),
    ).rejects.toThrow("after its start");
    expect(exceptionCreate).not.toHaveBeenCalled();
  });

  it("does not allow deleting another user's exception", async () => {
    exceptionDeleteMany.mockResolvedValue({ count: 0 });
    await expect(
      service.deleteException("user-id", "exception-id"),
    ).rejects.toThrow();
    expect(exceptionDeleteMany).toHaveBeenCalledWith({
      where: { id: "exception-id", user_id: "user-id" },
    });
  });

  it("returns concrete public slots with confirmed work removed", async () => {
    ruleFindMany.mockResolvedValue([
      {
        id: "rule-id",
        day_of_week: 3,
        start_time: new Date("1970-01-01T08:00:00Z"),
        end_time: new Date("1970-01-01T17:00:00Z"),
      },
    ]);
    assignmentFindMany.mockResolvedValue([
      {
        agreed_starts_at: new Date("2026-09-02T06:00:00Z"),
        agreed_ends_at: new Date("2026-09-02T08:00:00Z"),
      },
    ]);

    const result = await service.getPublicSlots(
      "worker-id",
      "2026-09-02T00:00:00Z",
      "2026-09-03T00:00:00Z",
    );

    expect(result.slots).toEqual([
      {
        startsAt: "2026-09-02T02:00:00.000Z",
        endsAt: "2026-09-02T06:00:00.000Z",
      },
      {
        startsAt: "2026-09-02T08:00:00.000Z",
        endsAt: "2026-09-02T11:00:00.000Z",
      },
    ]);
  });
});
