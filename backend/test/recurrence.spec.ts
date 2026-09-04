import { BadRequestException } from "@nestjs/common";

import {
  generateOccurrences,
  parseRecurrenceRule,
} from "../src/modules/jobs/recurrence/recurrence";

describe("recurrence generation", () => {
  it("keeps the same Dhaka wall-clock time throughout a 90-day series", () => {
    const rule = parseRecurrenceRule({
      frequency: "DAILY",
      daysOfWeek: [],
      startDate: "2026-01-01",
      startTime: "09:00",
      endTime: "10:30",
      count: 90,
      timezone: "Asia/Dhaka",
    });

    const occurrences = generateOccurrences(
      rule,
      new Date("2026-04-01T23:59:59.999Z"),
    );

    expect(occurrences).toHaveLength(90);
    expect(
      new Set(occurrences.map((item) => item.startsAt.toISOString().slice(11))),
    ).toEqual(new Set(["03:00:00.000Z"]));
    expect(
      new Set(occurrences.map((item) => item.endsAt.toISOString().slice(11))),
    ).toEqual(new Set(["04:30:00.000Z"]));
    expect(occurrences.at(-1)?.scheduledDate.toISOString().slice(0, 10)).toBe(
      "2026-03-31",
    );
  });

  it("uses stable calendar-day sequence numbers for selected weekdays", () => {
    const rule = parseRecurrenceRule({
      frequency: "WEEKLY",
      daysOfWeek: [1, 3],
      startDate: "2026-09-01",
      startTime: "14:00",
      endTime: "16:00",
      count: 4,
      timezone: "Asia/Dhaka",
    });

    const occurrences = generateOccurrences(
      rule,
      new Date("2026-09-30T23:59:59.999Z"),
    );

    expect(
      occurrences.map((item) => [
        item.scheduledDate.toISOString().slice(0, 10),
        item.sequenceNo,
      ]),
    ).toEqual([
      ["2026-09-02", 2],
      ["2026-09-07", 7],
      ["2026-09-09", 9],
      ["2026-09-14", 14],
    ]);
  });

  it("requires exactly one bounded series end", () => {
    expect(() =>
      parseRecurrenceRule({
        frequency: "DAILY",
        startDate: "2026-09-01",
        startTime: "09:00",
        endTime: "10:00",
        timezone: "Asia/Dhaka",
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseRecurrenceRule({
        frequency: "DAILY",
        startDate: "2026-09-01",
        startTime: "09:00",
        endTime: "10:00",
        until: "2026-09-30",
        count: 5,
        timezone: "Asia/Dhaka",
      }),
    ).toThrow(BadRequestException);
  });
});
