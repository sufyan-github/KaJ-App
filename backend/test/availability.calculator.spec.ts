import {
  calculateAvailability,
  calculateRecurringAvailability,
  DHAKA_OFFSET_MINUTES,
} from "../src/modules/availability/availability.calculator";

const window = (startsAt: string, endsAt: string) => ({
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
});

describe("availability calculator", () => {
  it("covers a rule crossing midnight", () => {
    const result = calculateAvailability({
      rules: [{ dayOfWeek: 0, startMinute: 22 * 60, endMinute: 2 * 60 }],
      jobWindow: window("2026-09-06T17:00:00Z", "2026-09-06T19:00:00Z"),
      minCoverage: 1,
    });
    expect(result).toMatchObject({ coverage: 1, isAvailable: true });
  });

  it("combines day slices for a job crossing midnight", () => {
    const result = calculateAvailability({
      rules: [
        { dayOfWeek: 0, startMinute: 23 * 60, endMinute: 0 },
        { dayOfWeek: 1, startMinute: 0, endMinute: 2 * 60 },
      ],
      jobWindow: window("2026-09-06T17:00:00Z", "2026-09-06T20:00:00Z"),
      minCoverage: 0.99,
    });
    expect(result.coverage).toBe(1);
    expect(result.isAvailable).toBe(true);
  });

  it("subtracts exception overlap from coverage", () => {
    const result = calculateAvailability({
      rules: [{ dayOfWeek: 0, startMinute: 9 * 60, endMinute: 17 * 60 }],
      exceptions: [window("2026-09-06T06:00:00Z", "2026-09-06T08:00:00Z")],
      jobWindow: window("2026-09-06T03:00:00Z", "2026-09-06T11:00:00Z"),
      minCoverage: 1,
    });
    expect(result).toMatchObject({ coverage: 0.75, isAvailable: false });
  });

  it("lists a buffered assignment as a hard conflict", () => {
    const result = calculateAvailability({
      rules: [{ dayOfWeek: 0, startMinute: 9 * 60, endMinute: 17 * 60 }],
      assignments: [window("2026-09-06T02:00:00Z", "2026-09-06T02:45:00Z")],
      jobWindow: window("2026-09-06T03:00:00Z", "2026-09-06T04:00:00Z"),
      minCoverage: 1,
    });
    expect(result.isAvailable).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });

  it("treats zero rules as unknown and does not exclude", () => {
    expect(
      calculateAvailability({
        rules: [],
        jobWindow: window("2026-09-06T03:00:00Z", "2026-09-06T04:00:00Z"),
        minCoverage: 1,
      }),
    ).toEqual({ coverage: null, isAvailable: true, conflicts: [] });
  });

  it("requires three of the next four recurring occurrences", () => {
    const occurrences = [6, 7, 8, 9].map((day) =>
      window(`2026-09-0${day}T03:00:00Z`, `2026-09-0${day}T04:00:00Z`),
    );
    const result = calculateRecurringAvailability(
      {
        rules: [0, 1, 2].map((dayOfWeek) => ({
          dayOfWeek,
          startMinute: 9 * 60,
          endMinute: 10 * 60,
        })),
        minCoverage: 1,
      },
      occurrences,
    );
    expect(result.isAvailable).toBe(true);
    expect(result.results.filter((item) => item.isAvailable)).toHaveLength(3);
  });

  it("uses Bangladesh's fixed UTC+06:00 offset", () => {
    expect(DHAKA_OFFSET_MINUTES).toBe(360);
    for (const month of [0, 3, 6, 9, 11]) {
      const utc = Date.UTC(2026, month, 1, 0, 0);
      expect(new Date(utc + DHAKA_OFFSET_MINUTES * 60_000).getUTCHours()).toBe(
        6,
      );
    }
  });

  it("ignores coverage for a project with no fixed time", () => {
    expect(calculateAvailability({ rules: [], minCoverage: 0.6 })).toEqual({
      coverage: null,
      isAvailable: true,
      conflicts: [],
    });
  });

  it("validates windows, thresholds, buffers, recurrence count, and rules", () => {
    const validWindow = window("2026-09-06T03:00:00Z", "2026-09-06T04:00:00Z");
    expect(() =>
      calculateAvailability({
        rules: [],
        jobWindow: window("2026-09-06T04:00:00Z", "2026-09-06T03:00:00Z"),
        minCoverage: 1,
      }),
    ).toThrow("positive duration");
    expect(() =>
      calculateAvailability({
        rules: [],
        jobWindow: validWindow,
        minCoverage: 1.1,
      }),
    ).toThrow("between zero and one");
    expect(() =>
      calculateAvailability({
        rules: [],
        jobWindow: validWindow,
        minCoverage: 1,
        travelBufferMinutes: -1,
      }),
    ).toThrow("cannot be negative");
    expect(() =>
      calculateRecurringAvailability({ rules: [], minCoverage: 1 }, [
        validWindow,
      ]),
    ).toThrow("four future occurrences");
    expect(() =>
      calculateAvailability({
        rules: [{ dayOfWeek: 7, startMinute: 0, endMinute: 60 }],
        jobWindow: validWindow,
        minCoverage: 1,
      }),
    ).toThrow("Day of week");
    expect(() =>
      calculateAvailability({
        rules: [{ dayOfWeek: 0, startMinute: -1, endMinute: 60 }],
        jobWindow: validWindow,
        minCoverage: 1,
      }),
    ).toThrow("Rule minutes");
  });

  it("merges overlapping rules and handles non-overlapping blocks", () => {
    const result = calculateAvailability({
      rules: [
        { dayOfWeek: 0, startMinute: 9 * 60, endMinute: 12 * 60 },
        { dayOfWeek: 0, startMinute: 10 * 60, endMinute: 13 * 60 },
      ],
      exceptions: [
        window("2026-09-06T00:00:00Z", "2026-09-06T01:00:00Z"),
        window("2026-09-06T05:00:00Z", "2026-09-06T06:00:00Z"),
      ],
      assignments: [
        window("2026-09-05T00:00:00Z", "2026-09-05T01:00:00Z"),
        window("2026-09-07T00:00:00Z", "2026-09-07T01:00:00Z"),
      ],
      jobWindow: window("2026-09-06T03:00:00Z", "2026-09-06T07:00:00Z"),
      minCoverage: 0.5,
    });
    expect(result).toMatchObject({
      coverage: 0.75,
      isAvailable: true,
      conflicts: [],
    });
  });

  it("supports an exception that removes the entire available interval", () => {
    const result = calculateAvailability({
      rules: [{ dayOfWeek: 0, startMinute: 9 * 60, endMinute: 10 * 60 }],
      exceptions: [window("2026-09-06T02:00:00Z", "2026-09-06T05:00:00Z")],
      jobWindow: window("2026-09-06T03:00:00Z", "2026-09-06T04:00:00Z"),
      minCoverage: 0.6,
    });
    expect(result).toMatchObject({ coverage: 0, isAvailable: false });
  });

  it("maintains coverage bounds and the availability implication for 1,000 inputs", () => {
    let state = 123_456_789;
    const random = () => {
      state = (1_664_525 * state + 1_013_904_223) >>> 0;
      return state / 2 ** 32;
    };
    for (let index = 0; index < 1_000; index += 1) {
      const startMinute = Math.floor(random() * 1_440);
      const duration = 1 + Math.floor(random() * 360);
      const jobStart =
        Date.UTC(2026, 8, 6, 0, 0) + Math.floor(random() * 1_440) * 60_000;
      const minCoverage = random();
      const result = calculateAvailability({
        rules: [
          {
            dayOfWeek: new Date(jobStart + 6 * 3_600_000).getUTCDay(),
            startMinute,
            endMinute: (startMinute + duration) % 1_440,
          },
        ],
        jobWindow: {
          startsAt: new Date(jobStart),
          endsAt: new Date(
            jobStart + (1 + Math.floor(random() * 480)) * 60_000,
          ),
        },
        minCoverage,
      });
      expect(result.coverage).not.toBeNull();
      expect(result.coverage!).toBeGreaterThanOrEqual(0);
      expect(result.coverage!).toBeLessThanOrEqual(1);
      if (result.isAvailable)
        expect(result.coverage!).toBeGreaterThanOrEqual(minCoverage);
    }
  });
});
