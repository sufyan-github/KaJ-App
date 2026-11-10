import { SkillLevel } from "@prisma/client";
import { validate } from "class-validator";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { UpdateWorkerProfileDto } from "../src/modules/users/dto/update-worker-profile.dto";
import { UsersService } from "../src/modules/users/users.service";

describe("worker skills and rates", () => {
  const skillCount = jest.fn();
  const deleteMany = jest.fn();
  const createMany = jest.fn();
  const findMany = jest.fn();
  const previousFindMany = jest.fn();
  const transaction = {
    skill: { count: skillCount },
    userSkill: { createMany, deleteMany, findMany: previousFindMany },
  };
  const prisma = {
    $transaction: jest.fn((callback) => callback(transaction)),
    userSkill: { findMany },
  } as unknown as PrismaService;
  const service = new UsersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    skillCount.mockResolvedValue(1);
    deleteMany.mockResolvedValue({ count: 0 });
    createMany.mockResolvedValue({ count: 1 });
    previousFindMany.mockResolvedValue([]);
    findMany.mockResolvedValue([
      {
        level: SkillLevel.ADVANCED,
        years: { toString: () => "3.5" },
        is_verified: false,
        skill: {
          id: "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f601",
          slug: "electrician",
          name_en: "Electrician",
          name_bn: "ইলেকট্রিশিয়ান",
        },
      },
    ]);
  });

  it("atomically replaces skills and returns both localized names", async () => {
    const skillId = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f601";
    const result = await service.updateWorkerSkills("user-id", [
      { skillId, level: SkillLevel.ADVANCED, years: 3.5 },
    ]);

    expect(deleteMany).toHaveBeenCalledWith({ where: { user_id: "user-id" } });
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          user_id: "user-id",
          skill_id: skillId,
          level: SkillLevel.ADVANCED,
          years: 3.5,
          has_prior_training: false,
        },
      ],
    });
    expect(result[0]).toMatchObject({
      nameEn: "Electrician",
      nameBn: "ইলেকট্রিশিয়ান",
    });
  });

  it("keeps a stored prior-training answer when the client omits it", async () => {
    const skillId = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f601";
    const otherId = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f602";
    previousFindMany.mockResolvedValue([{ skill_id: skillId }]);
    skillCount.mockResolvedValue(2);

    await service.updateWorkerSkills("user-id", [
      { skillId, level: SkillLevel.BEGINNER },
      { skillId: otherId, level: SkillLevel.BEGINNER, hasPriorTraining: true },
    ]);

    expect(createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ skill_id: skillId, has_prior_training: true }),
      expect.objectContaining({ skill_id: otherId, has_prior_training: true }),
    ]);
  });

  it("rejects an unknown or inactive skill before replacing the set", async () => {
    skillCount.mockResolvedValue(0);

    await expect(
      service.updateWorkerSkills("user-id", [
        {
          skillId: "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f699",
          level: SkillLevel.BEGINNER,
        },
      ]),
    ).rejects.toThrow("Every skill must be active and known");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it.each([4_999, 5_000_001])(
    "rejects an out-of-range rate of %i",
    async (rate) => {
      const dto = Object.assign(new UpdateWorkerProfileDto(), {
        hourlyRatePoisha: rate,
      });
      expect(await validate(dto)).not.toHaveLength(0);
    },
  );

  it.each([5_000, 5_000_000, null])(
    "accepts a boundary or blank rate of %s",
    async (rate) => {
      const dto = Object.assign(new UpdateWorkerProfileDto(), {
        hourlyRatePoisha: rate,
      });
      expect(await validate(dto)).toHaveLength(0);
    },
  );
});
