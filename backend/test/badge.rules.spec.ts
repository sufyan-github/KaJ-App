import { TrustLevel } from "@prisma/client";

import { eligibleBadgeSlugs } from "../src/modules/reviews/badge.rules";

describe("badge rules", () => {
  it("grants and revokes badges from objective stored facts", () => {
    expect(
      eligibleBadgeSlugs({
        trustLevel: TrustLevel.IDENTITY,
        completedJobs: 25,
        ratingAverage: 4.9,
        ratingCount: 12,
        completionRateBps: 9500,
      }),
    ).toEqual(["verified", "reliable", "top-rated", "experienced"]);
    expect(
      eligibleBadgeSlugs({
        trustLevel: TrustLevel.NONE,
        completedJobs: 1,
        ratingAverage: 5,
        ratingCount: 1,
        completionRateBps: 5000,
      }),
    ).toEqual(["new-worker"]);
  });

  it("does not call a phone-only account verified", () => {
    expect(
      eligibleBadgeSlugs({
        trustLevel: TrustLevel.PHONE,
        completedJobs: 0,
        ratingAverage: 0,
        ratingCount: 0,
        completionRateBps: 0,
      }),
    ).toEqual(["new-worker"]);
  });

  it("keeps the business badge for business-verified accounts", () => {
    expect(
      eligibleBadgeSlugs({
        trustLevel: TrustLevel.BUSINESS,
        completedJobs: 3,
        ratingAverage: 0,
        ratingCount: 0,
        completionRateBps: 0,
      }),
    ).toEqual(["verified", "business-verified"]);
  });
});
