import {
  eligibleBadgeSlugs,
  RULE_BADGE_SLUGS,
} from "../src/modules/reviews/badge.rules";
import {
  dhakaLocalSlot,
  rankingRating,
  rankingReliability,
  workerSelect,
} from "../src/modules/matching/matching.service";

describe("matching inputs", () => {
  it("compares job times in Dhaka local time", () => {
    // 09:00–11:00 Dhaka on a Tuesday is 03:00–05:00 UTC.
    expect(
      dhakaLocalSlot(
        new Date("2026-11-10T03:00:00Z"),
        new Date("2026-11-10T05:00:00Z"),
      ),
    ).toEqual({ day: 2, start: 9 * 60, end: 11 * 60 });
  });

  it("uses the Dhaka weekday for early-morning jobs", () => {
    // 00:30 Wednesday in Dhaka is still Tuesday 18:30 UTC.
    expect(
      dhakaLocalSlot(
        new Date("2026-11-10T18:30:00Z"),
        new Date("2026-11-10T19:30:00Z"),
      )?.day,
    ).toBe(3);
  });

  it("returns no slot when it crosses local midnight", () => {
    expect(
      dhakaLocalSlot(
        new Date("2026-11-10T17:00:00Z"),
        new Date("2026-11-10T19:00:00Z"),
      ),
    ).toBeNull();
  });

  it("gives a new worker a neutral rating and reliability, not the worst", () => {
    expect(rankingRating(0, 0)).toBeCloseTo(0.8);
    expect(rankingReliability(0, 0)).toBe(0.75);
    expect(rankingReliability(0.4, 10)).toBe(0.4);
  });

  it("damps a single early review", () => {
    expect(rankingRating(5, 1)).toBeLessThan(rankingRating(4.9, 40));
  });

  it("never selects protected attributes for ranking", () => {
    const selected = JSON.stringify(workerSelect);
    for (const field of ["gender", "religion", "disability", "birth_year"])
      expect(selected).not.toContain(field);
  });
});

describe("badges", () => {
  const base = {
    completedJobs: 0,
    ratingAverage: 0,
    ratingCount: 0,
    completionRateBps: 0,
  };

  it("grants 'verified' only when identity was checked", () => {
    expect(eligibleBadgeSlugs({ ...base, isVerified: true })).toContain(
      "verified",
    );
    expect(eligibleBadgeSlugs({ ...base, isVerified: false })).not.toContain(
      "verified",
    );
  });

  it("leaves staff-granted badges out of the rule reconcile", () => {
    expect(RULE_BADGE_SLUGS.has("business-verified")).toBe(false);
    expect(RULE_BADGE_SLUGS.has("verified")).toBe(true);
  });
});
