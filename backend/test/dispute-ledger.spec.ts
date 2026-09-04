import { DisputeDecision, PaymentMethod, PaymentStatus } from "@prisma/client";

import { ledgerBalances } from "../src/modules/payments/fee-resolver";
import { planDisputeAllocation } from "../src/modules/disputes/dispute-ledger";

const payment = {
  amountPoisha: 50_000n,
  feePoisha: 4_000n,
  method: PaymentMethod.MOBILE_FINANCIAL_SERVICE,
  payerUserId: "payer",
  status: PaymentStatus.HELD,
  workerUserId: "worker",
};

describe("dispute ledger allocation", () => {
  it.each([
    [DisputeDecision.RELEASE_FULL, 0n, 50_000n, PaymentStatus.RELEASED],
    [DisputeDecision.REFUND_FULL, 50_000n, 0n, PaymentStatus.REFUNDED],
    [DisputeDecision.SPLIT, 20_000n, 30_000n, PaymentStatus.PARTIALLY_REFUNDED],
    [
      DisputeDecision.RELEASE_PARTIAL,
      10_000n,
      40_000n,
      PaymentStatus.PARTIALLY_REFUNDED,
    ],
    [
      DisputeDecision.REFUND_PARTIAL,
      40_000n,
      10_000n,
      PaymentStatus.PARTIALLY_REFUNDED,
    ],
  ])("balances %s", (decision, refund, release, status) => {
    const result = planDisputeAllocation({
      decision,
      payment,
      refundPoisha: refund,
      releasePoisha: release,
    });
    expect(result).toMatchObject({
      digital: true,
      refundPoisha: refund,
      releasePoisha: release,
      status,
    });
    expect(ledgerBalances(result.entries)).toBe(true);
  });

  it("records cash allocation without creating ledger movement", () => {
    const result = planDisputeAllocation({
      decision: DisputeDecision.REFUND_FULL,
      payment: { ...payment, method: PaymentMethod.CASH_ON_COMPLETION },
    });
    expect(result.digital).toBe(false);
    expect(result.entries).toEqual([]);
  });

  it("rejects partial allocations that do not distribute the full amount", () => {
    expect(() =>
      planDisputeAllocation({
        decision: DisputeDecision.SPLIT,
        payment,
        refundPoisha: 20_000n,
        releasePoisha: 20_000n,
      }),
    ).toThrow("equal the held amount");
  });
});
