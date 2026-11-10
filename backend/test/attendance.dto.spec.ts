import "reflect-metadata";

import { BadRequestException, ValidationPipe } from "@nestjs/common";

import {
  CheckInDto,
  CheckOutDto,
} from "../src/modules/attendance/dto/attendance.dto";
import {
  CreateBookingRequestDto,
  CreateJobDto,
} from "../src/modules/jobs/dto/jobs.dto";

// The same options the API installs globally in app.bootstrap.ts.
const pipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

function parse<T>(metatype: new () => T, value: Record<string, unknown>) {
  return pipe.transform(value, { type: "body", metatype }) as Promise<T>;
}

// A reading exactly as an Android phone reports it.
const deviceReading = {
  lat: 24.374012345678912,
  lng: 88.601234567891234,
  accuracyM: 12.300000190734863,
  consentGranted: true,
  consentVersion: "location-checkin-v1",
  capturedAt: "2026-09-04T15:00:00.000Z",
};

describe("attendance location validation", () => {
  it("rounds a real device reading on check-in instead of rejecting it", async () => {
    const dto = await parse(CheckInDto, {
      ...deviceReading,
      mockLocation: false,
    });

    expect(dto.lat).toBe(24.3740123);
    expect(dto.lng).toBe(88.6012346);
    expect(dto.accuracyM).toBe(12.3);
  });

  it("accepts the mock-location flag older apps send on check-out", async () => {
    const dto = await parse(CheckOutDto, {
      ...deviceReading,
      mockLocation: true,
      notes: "Finished",
    });

    expect(dto.mockLocation).toBe(true);
    expect(dto.accuracyM).toBe(12.3);
  });

  it("still rejects non-numeric and out-of-range coordinates", async () => {
    await expect(
      parse(CheckInDto, { ...deviceReading, lat: "north" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      parse(CheckOutDto, { ...deviceReading, lng: 181 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("still rejects unknown check-out fields", async () => {
    await expect(
      parse(CheckOutDto, { ...deviceReading, speed: 3 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("job work-site pin validation", () => {
  const job = {
    title: "Fix the kitchen tap",
    description: "The kitchen tap leaks and needs a new washer.",
    categoryId: "01a05e61-850b-7ddc-b456-9291f04c0e20",
    skillIds: [],
    jobType: "ONE_TIME",
    paymentModel: "FIXED",
    locationId: "01a05e61-855f-7813-aac7-59ba7a6d447f",
  };

  it("accepts an optional pin and rounds it to the stored precision", async () => {
    const dto = await parse(CreateJobDto, {
      ...job,
      lat: 24.374012345678912,
      lng: 88.601234567891234,
    });

    expect(dto.lat).toBe(24.374012);
    expect(dto.lng).toBe(88.601235);
  });

  it("keeps the pin optional", async () => {
    const dto = await parse(CreateJobDto, job);

    expect(dto.lat).toBeUndefined();
    expect(dto.lng).toBeUndefined();
  });

  it("rejects an impossible pin on a booking request", async () => {
    await expect(
      parse(CreateBookingRequestDto, {
        title: "Fix the kitchen tap",
        description: "The kitchen tap leaks and needs a new washer.",
        categoryId: "01a05e61-850b-7ddc-b456-9291f04c0e20",
        locationId: "01a05e61-855f-7813-aac7-59ba7a6d447f",
        startsAt: "2026-09-05T09:00:00.000Z",
        endsAt: "2026-09-05T11:00:00.000Z",
        offeredPricePoisha: "50000",
        lat: 91,
        lng: 88.6,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
