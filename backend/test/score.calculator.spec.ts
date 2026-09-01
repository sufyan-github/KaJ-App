import {
  calculateMatch,
  defaultMatchingWeights,
  normalizeMatchingWeights,
} from "../src/modules/matching/score.calculator";

describe("matching score calculator", () => {
  it("produces a deterministic golden score with explainable components", () => {
    const result = calculateMatch({
      skill: 1,
      location: 1,
      availability: 1,
      budget: 0.5,
      experience: 0.5,
      rating: 0.8,
      reliability: 0.9,
    });

    expect(result.score).toBe(87);
    expect(
      Object.values(result.components).reduce((sum, value) => sum + value, 0),
    ).toBe(87);
    expect(result.reasons).toEqual([
      "Skills match",
      "Available for this time",
      "Nearby service area",
    ]);
  });

  it("never produces NaN when profile data is missing", () => {
    const result = calculateMatch({
      skill: undefined,
      location: null,
      availability: Number.NaN,
      budget: undefined,
      experience: null,
      rating: Number.NaN,
      reliability: undefined,
    });
    expect(result.score).toBe(0);
    expect(Object.values(result.components).every(Number.isFinite)).toBe(true);
  });

  it("normalizes live configuration and changes ranking influence", () => {
    const weights = normalizeMatchingWeights({
      skill: 9,
      location: 1,
      availability: 0,
      budget: 0,
      experience: 0,
      rating: 0,
      reliability: 0,
    });
    expect(
      Object.values(weights).reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(1);
    expect(
      calculateMatch(
        {
          skill: 1,
          location: 0,
          availability: 0,
          budget: 0,
          experience: 0,
          rating: 0,
          reliability: 0,
        },
        weights,
      ).score,
    ).toBe(90);
    expect(defaultMatchingWeights.skill).toBe(0.3);
  });
});
