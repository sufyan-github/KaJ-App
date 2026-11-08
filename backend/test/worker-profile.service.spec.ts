import { SkillLevel } from "@prisma/client";
import { validate } from "class-validator";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { UpdateWorkerProfileDto } from "../src/modules/users/dto/update-worker-profile.dto";
import { UsersService } from "../src/modules/users/users.service";

describe("worker skills and rates", () => {
  const skillCount = jest.fn();
  const deleteMany = jest.fn();
  const upsert = jest.fn();
  const findMany = jest.fn();
  const transaction = {
    skill: { count: skillCount },
    userSkill: { upsert, deleteMany },
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
    upsert.mockResolvedValue({});
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

  it("upserts kept skills, deletes only dropped ones and returns both localized names", async () => {
    const skillId = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f601";
    const result = await service.updateWorkerSkills("user-id", [
      { skillId, level: SkillLevel.ADVANCED, years: 3.5 },
    ]);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { user_id: "user-id", skill_id: { notIn: [skillId] } },
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { user_id_skill_id: { user_id: "user-id", skill_id: skillId } },
      update: { level: SkillLevel.ADVANCED, years: 3.5 },
      create: {
        user_id: "user-id",
        skill_id: skillId,
        level: SkillLevel.ADVANCED,
        years: 3.5,
      },
    });
    expect(result[0]).toMatchObject({
      nameEn: "Electrician",
      nameBn: "ইলেকট্রিশিয়ান",
    });
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
