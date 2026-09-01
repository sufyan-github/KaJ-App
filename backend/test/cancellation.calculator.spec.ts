import {
  calculateCancellation,
  defaultCancellationPolicy,
} from "../src/modules/jobs/cancellation/cancellation.calculator";

const startsAt = new Date("2026-09-10T12:00:00.000Z");
const price = 10_000n;

function atHoursBefore(hours: number) {
  return new Date(startsAt.getTime() - hours * 3_600_000);
}

describe("cancellation calculator", () => {
  it.each([
    [24, "none", "10000", "0"],
    [6, "warning", "10000", "0"],
    [2, "fee_25pct", "7500", "2500"],
    [0, "fee_50pct", "5000", "5000"],
  ])(
    "uses the customer tier at the exact %sh boundary",
    (hours, penalty, refund, fee) => {
      const result = calculateCancellation({
        actor: "customer",
        now: atHoursBefore(hours as number),
        startsAt,
        agreedPricePoisha: price,
      });
      expect(result.penaltyCode).toBe(penalty);
      expect(result.refundPoisha).toBe(refund);
      expect(result.feePoisha).toBe(fee);
    },
  );

  it.each([
    [24, "none", 0, false],
    [6, "reliability_-2", -2, false],
    [2, "reliability_-5", -5, false],
    [0, "reliability_-10,strike", -10, true],
  ])(
    "uses the worker tier at the exact %sh boundary",
    (hours, penalty, delta, strike) => {
      const result = calculateCancellation({
        actor: "worker",
        now: atHoursBefore(hours as number),
        startsAt,
        agreedPricePoisha: price,
      });
      expect(result.penaltyCode).toBe(penalty);
      expect(result.reliabilityDelta).toBe(delta);
      expect(result.addsStrike).toBe(strike);
    },
  );

  it("defers emergency penalties for admin review", () => {
    const result = calculateCancellation({
      actor: "worker",
      now: atHoursBefore(1),
      startsAt,
      agreedPricePoisha: price,
      reasonCode: defaultCancellationPolicy.emergencyReasonCodes[0],
    });
    expect(result.needsAdminReview).toBe(true);
    expect(result.addsStrike).toBe(false);
    expect(result.reliabilityDelta).toBe(0);
    expect(result.summaryBn).toContain("প্রশাসক যাচাই করবেন");
  });
});
