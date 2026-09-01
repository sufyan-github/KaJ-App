import { eligibleBadgeSlugs } from "../src/modules/reviews/badge.rules";

describe("badge rules", () => {
  it("grants and revokes badges from objective stored facts", () => {
    expect(
      eligibleBadgeSlugs({
        isVerified: true,
        completedJobs: 25,
        ratingAverage: 4.9,
        ratingCount: 12,
        completionRateBps: 9500,
      }),
    ).toEqual(["verified", "reliable", "top-rated", "experienced"]);
    expect(
      eligibleBadgeSlugs({
        isVerified: false,
        completedJobs: 1,
        ratingAverage: 5,
        ratingCount: 1,
        completionRateBps: 5000,
      }),
    ).toEqual(["new-worker"]);
  });
});
