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

    expect(dto.lat).toBe(24.374012);
    expect(dto.lng).toBe(88.601235);
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

const run = parse;

// Exactly what the shipped Flutter client sends (trust_safety_repository.dart
// _locationPayload), with raw Android values: Float accuracy widened to Double
// and full-precision coordinates.
const appPayload = {
  lat: 24.374512345678,
  lng: 88.604234567891,
  accuracyM: 3.9000000953674316,
  capturedAt: "2026-11-08T04:00:00.000Z",
  mockLocation: false,
  consentGranted: true,
  consentVersion: "location-checkin-v1",
};

describe("attendance DTOs", () => {
  it("accepts the app's check-out payload, including mockLocation", async () => {
    const dto = await run(CheckOutDto, { ...appPayload, notes: "done" });
    expect(dto).toMatchObject({ mockLocation: false, notes: "done" });
  });

  it("accepts the app's check-in payload", async () => {
    await expect(run(CheckInDto, appPayload)).resolves.toBeInstanceOf(
      CheckInDto,
    );
  });

  it("rounds to the stored precision instead of rejecting", async () => {
    const dto = await run(CheckOutDto, appPayload);
    expect(dto.lat).toBe(24.374512);
    expect(dto.lng).toBe(88.604235);
    expect(dto.accuracyM).toBe(3.9);
  });

  it("accepts numeric strings", async () => {
    const dto = await run(CheckInDto, {
      ...appPayload,
      lat: "24.3745",
      lng: "88.6042",
      accuracyM: "12.5",
    });
    expect(dto).toMatchObject({ lat: 24.3745, lng: 88.6042, accuracyM: 12.5 });
  });

  it.each([
    ["latitude out of range", { lat: 91 }],
    ["longitude out of range", { lng: -181 }],
    ["negative accuracy", { accuracyM: -1 }],
    ["non-numeric latitude", { lat: "north" }],
    ["NaN accuracy", { accuracyM: Number.NaN }],
  ])("still rejects %s", async (_label, change) => {
    await expect(
      run(CheckOutDto, { ...appPayload, ...change }),
    ).rejects.toThrow();
  });

  it("still rejects unknown fields", async () => {
    await expect(
      run(CheckOutDto, { ...appPayload, unexpected: true }),
    ).rejects.toThrow();
  });
});
