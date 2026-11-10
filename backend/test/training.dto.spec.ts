import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { SkillLevel } from "@prisma/client";

import { CreateJobAlertDto } from "../src/modules/job-alerts/dto/job-alert.dto";
import {
  CourseListQueryDto,
  SubmitTrainingAttemptDto,
} from "../src/modules/training/dto/training.dto";
import { UpdateWorkerSkillsDto } from "../src/modules/users/dto/update-worker-skills.dto";

// The same options the API installs globally in app.bootstrap.ts.
const pipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

function parse<T>(
  metatype: new () => T,
  value: Record<string, unknown>,
  type: "body" | "query" = "body",
) {
  return pipe.transform(value, { type, metatype }) as Promise<T>;
}

const uuid = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f601";
const otherUuid = "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f602";

describe("training request validation", () => {
  it("accepts a well-formed submission", async () => {
    const dto = await parse(SubmitTrainingAttemptDto, {
      answers: [{ questionId: uuid, optionId: "a" }],
    });
    expect(dto.answers[0]).toEqual({ questionId: uuid, optionId: "a" });
    await expect(
      parse(SubmitTrainingAttemptDto, { answers: [] }),
    ).resolves.toBeDefined();
  });

  it.each([
    [{}],
    [{ answers: "a" }],
    [{ answers: [{ questionId: "not-a-uuid", optionId: "a" }] }],
    [{ answers: [{ questionId: uuid }] }],
    [{ answers: [{ questionId: uuid, optionId: "a b" }] }],
    [{ answers: [{ questionId: uuid, optionId: "a", correct: true }] }],
    [{ answers: [], score: 100 }],
  ])("rejects a malformed submission %#", async (body) => {
    await expect(parse(SubmitTrainingAttemptDto, body)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("accepts only known course scopes", async () => {
    await expect(
      parse(CourseListQueryDto, { scope: "all" }, "query"),
    ).resolves.toEqual({ scope: "all" });
    await expect(parse(CourseListQueryDto, {}, "query")).resolves.toEqual({});
    await expect(
      parse(CourseListQueryDto, { scope: "everything" }, "query"),
    ).rejects.toThrow(BadRequestException);
  });
});

describe("job alert request validation", () => {
  it("accepts any non-empty combination of filters", async () => {
    await expect(
      parse(CreateJobAlertDto, { skillId: uuid }),
    ).resolves.toMatchObject({ skillId: uuid });
    await expect(
      parse(CreateJobAlertDto, { categoryId: uuid, locationId: otherUuid }),
    ).resolves.toMatchObject({ categoryId: uuid, locationId: otherUuid });
  });

  it.each([
    [{}],
    [{ skillId: "cleaning" }],
    [{ categoryId: null }],
    [{ locationId: uuid, radiusKm: 5 }],
  ])("rejects an empty or malformed alert %#", async (body) => {
    await expect(parse(CreateJobAlertDto, body)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe("worker skill prior training flag", () => {
  it("is optional and must be a boolean", async () => {
    const dto = await parse(UpdateWorkerSkillsDto, {
      skills: [
        { skillId: uuid, level: SkillLevel.BEGINNER, hasPriorTraining: true },
        { skillId: otherUuid, level: SkillLevel.EXPERT, years: 5 },
      ],
    });
    expect(dto.skills[0]!.hasPriorTraining).toBe(true);
    expect(dto.skills[1]!.hasPriorTraining).toBeUndefined();
    await expect(
      parse(UpdateWorkerSkillsDto, {
        skills: [
          {
            skillId: uuid,
            level: SkillLevel.BEGINNER,
            hasPriorTraining: "yes",
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
