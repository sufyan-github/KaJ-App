import {
  applyTrainingBonus,
  calculateMatch,
  MAX_TRAINING_SKILL_BONUS,
} from "../src/modules/matching/score.calculator";

describe("training certificate matching bonus", () => {
  it("adds at most the bounded bonus for certified required skills", () => {
    expect(applyTrainingBonus(0.5, ["a"], new Set(["a"]))).toBeCloseTo(0.6);
    expect(applyTrainingBonus(0.5, ["a", "b"], new Set(["a"]))).toBeCloseTo(
      0.55,
    );
    expect(applyTrainingBonus(0.95, ["a"], new Set(["a"]))).toBe(1);
    expect(applyTrainingBonus(1, ["a"], new Set(["a"]))).toBe(1);
  });

  it("never subtracts and ignores unrelated certificates", () => {
    expect(applyTrainingBonus(0.5, ["a"], new Set())).toBe(0.5);
    expect(applyTrainingBonus(0.5, ["a"], new Set(["z"]))).toBe(0.5);
    expect(applyTrainingBonus(0.5, [], new Set(["a"]))).toBe(0.5);
  });

  it("moves the overall score by no more than the skill weight times the bonus", () => {
    const signals = {
      skill: 0.5,
      location: 1,
      availability: 1,
      budget: 0.5,
      experience: 0.7,
      rating: 0.8,
      reliability: 0.9,
    };
    const without = calculateMatch(signals);
    const withBonus = calculateMatch({
      ...signals,
      skill: applyTrainingBonus(0.5, ["a"], new Set(["a"])),
    });
    const delta = withBonus.score - without.score;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(
      Math.ceil(0.3 * MAX_TRAINING_SKILL_BONUS * 100),
    );
  });
});
