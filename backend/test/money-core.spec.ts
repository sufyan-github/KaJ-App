import {
  calculateBreakdown,
  FeeRuleValue,
  ledgerBalances,
  resolveFeeRule,
} from "../src/modules/payments/fee-resolver";

const rule = (scopeKey: string, feeBps: number): FeeRuleValue => ({
  feeBps,
  maxFeePoisha: null,
  minFeePoisha: 0n,
  payer: "worker",
  scopeKey,
});

describe("Phase 9 money core", () => {
  it("resolves fees in user, tier, category, global order", () => {
    const rules = new Map<string, FeeRuleValue>([
      ["GLOBAL:*", rule("GLOBAL:*", 800)],
      ["CATEGORY:category", rule("CATEGORY:category", 700)],
      ["TIER:pro", rule("TIER:pro", 600)],
      ["USER:user", rule("USER:user", 500)],
    ]);
    const context = {
      categoryId: "category",
      global: rule("fallback", 900),
      rules,
      tier: "pro",
      userId: "user",
    };
    expect(resolveFeeRule(context).scopeKey).toBe("USER:user");
    rules.delete("USER:user");
    expect(resolveFeeRule(context).scopeKey).toBe("TIER:pro");
    rules.delete("TIER:pro");
    expect(resolveFeeRule(context).scopeKey).toBe("CATEGORY:category");
    rules.delete("CATEGORY:category");
    expect(resolveFeeRule(context).scopeKey).toBe("GLOBAL:*");
    rules.delete("GLOBAL:*");
    expect(resolveFeeRule(context).scopeKey).toBe("fallback");
  });

  it("calculates transparent worker, customer and split fee breakdowns", () => {
    expect(calculateBreakdown(50_000n, rule("GLOBAL:*", 800))).toEqual({
      agreedPoisha: 50_000n,
      customerPaysPoisha: 50_000n,
      feePoisha: 4_000n,
      workerReceivesPoisha: 46_000n,
    });
    expect(
      calculateBreakdown(50_000n, {
        ...rule("GLOBAL:*", 800),
        payer: "customer",
      }),
    ).toMatchObject({
      customerPaysPoisha: 54_000n,
      workerReceivesPoisha: 50_000n,
    });
    expect(
      calculateBreakdown(50_000n, {
        ...rule("GLOBAL:*", 800),
        payer: "split",
      }),
    ).toMatchObject({
      customerPaysPoisha: 52_000n,
      workerReceivesPoisha: 48_000n,
    });
  });

  it.each([
    [
      "charge",
      [
        ["DEBIT", 50_000n],
        ["CREDIT", 50_000n],
      ],
    ],
    [
      "release",
      [
        ["DEBIT", 50_000n],
        ["CREDIT", 46_000n],
        ["CREDIT", 4_000n],
      ],
    ],
    [
      "refund",
      [
        ["DEBIT", 50_000n],
        ["CREDIT", 50_000n],
      ],
    ],
    [
      "partial refund",
      [
        ["DEBIT", 25_000n],
        ["CREDIT", 25_000n],
      ],
    ],
    [
      "payout",
      [
        ["DEBIT", 46_000n],
        ["CREDIT", 46_000n],
      ],
    ],
  ])("balances %s postings to zero", (_name, values) => {
    expect(
      ledgerBalances(
        values.map(([direction, amountPoisha]) => ({
          direction: direction as "DEBIT" | "CREDIT",
          amountPoisha: amountPoisha as bigint,
        })),
      ),
    ).toBe(true);
  });

  it("rejects an unbalanced posting", () => {
    expect(
      ledgerBalances([
        { direction: "DEBIT", amountPoisha: 50_000n },
        { direction: "CREDIT", amountPoisha: 49_999n },
      ]),
    ).toBe(false);
  });
});
