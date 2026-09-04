import "reflect-metadata";

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { CreateJobDto } from "../src/modules/jobs/dto/jobs.dto";

describe("CreateJobDto", () => {
  it("accepts the UUIDv7 identifiers generated for catalog skills", async () => {
    const dto = plainToInstance(CreateJobDto, {
      title: "A valid job title",
      description: "A sufficiently detailed job description.",
      categoryId: "01a05e61-850b-7ddc-b456-9291f04c0e20",
      skillIds: ["01a05e61-8511-7b01-958b-c30096879e74"],
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      locationId: "01a05e61-855f-7813-aac7-59ba7a6d447f",
    });

    const errors = await validate(dto);

    expect(
      errors.find((error) => error.property === "skillIds"),
    ).toBeUndefined();
  });
});
