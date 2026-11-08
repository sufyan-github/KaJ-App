import "reflect-metadata";

import { ArgumentMetadata, ValidationPipe } from "@nestjs/common";

import {
  CheckInDto,
  CheckOutDto,
} from "../src/modules/attendance/dto/attendance.dto";

// Same options as the global pipe in app.bootstrap.ts.
const pipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
});

function run<T>(metatype: new () => T, body: unknown) {
  const metadata: ArgumentMetadata = { type: "body", metatype };
  return pipe.transform(body, metadata) as Promise<T>;
}

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
