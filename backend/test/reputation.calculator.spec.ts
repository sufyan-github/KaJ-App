import {
  dampedRating,
  rateBps,
  rawRating,
  workerReliability,
} from "../src/modules/reviews/reputation.calculator";

describe("reputation calculator", () => {
  it("shows the raw average but dampens ranking scores toward four", () => {
    expect(rawRating([5, 5])).toBe(5);
    expect(dampedRating([5, 5])).toBe(4.29);
  });

  it("calculates basis-point rates without dividing by zero", () => {
    expect(rateBps(8, 10)).toBe(8000);
    expect(rateBps(0, 0)).toBe(0);
  });

  it("keeps the internal reliability value bounded", () => {
    expect(
      workerReliability({
        completedJobs: 8,
        cancelledJobs: 2,
        noShows: 0,
        rawRating: 5,
        ratingCount: 2,
      }),
    ).toBe(0.86);
  });
});
