import {
  DisputeDecision,
  LedgerAccountType,
  LedgerDirection,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";

import { LedgerPosting } from "../payments/ledger.service";

export interface DisputeAllocationInput {
  decision: DisputeDecision;
  payment: {
    amountPoisha: bigint;
    feePoisha: bigint;
    method: PaymentMethod;
    payerUserId: string;
    status: PaymentStatus;
    workerUserId: string;
  };
  refundPoisha?: bigint;
  releasePoisha?: bigint;
}

export function planDisputeAllocation(input: DisputeAllocationInput) {
  const amount = input.payment.amountPoisha;
  let refund = input.refundPoisha ?? 0n;
  let release = input.releasePoisha ?? 0n;
  if (input.decision === DisputeDecision.RELEASE_FULL) {
    release = amount;
    refund = 0n;
  } else if (input.decision === DisputeDecision.REFUND_FULL) {
    refund = amount;
    release = 0n;
  }
  if (refund < 0n || release < 0n || refund + release !== amount)
    throw new Error(
      "Release and refund allocations must equal the held amount.",
    );
  if (
    (input.decision === DisputeDecision.RELEASE_PARTIAL ||
      input.decision === DisputeDecision.REFUND_PARTIAL ||
      input.decision === DisputeDecision.SPLIT) &&
    (refund === 0n || release === 0n)
  )
    throw new Error("A partial or split decision requires both allocations.");

  const digital =
    input.payment.method !== PaymentMethod.CASH_ON_COMPLETION &&
    input.payment.status === PaymentStatus.HELD;
  const entries: LedgerPosting[] = [];
  if (digital) {
    entries.push({
      accountType: LedgerAccountType.PLATFORM_ESCROW,
      accountRef: "platform",
      direction: LedgerDirection.DEBIT,
      amountPoisha: amount,
      memo: `Dispute ${input.decision}`,
    });
    if (refund > 0n)
      entries.push({
        accountType: LedgerAccountType.CUSTOMER_WALLET,
        accountRef: input.payment.payerUserId,
        direction: LedgerDirection.CREDIT,
        amountPoisha: refund,
        memo: "Dispute refund",
      });
    if (release > 0n) {
      const fee = (input.payment.feePoisha * release) / amount;
      const worker = release - fee;
      if (worker > 0n)
        entries.push({
          accountType: LedgerAccountType.WORKER_WALLET,
          accountRef: input.payment.workerUserId,
          direction: LedgerDirection.CREDIT,
          amountPoisha: worker,
          memo: "Dispute release",
        });
      if (fee > 0n)
        entries.push({
          accountType: LedgerAccountType.PLATFORM_FEE,
          accountRef: "platform",
          direction: LedgerDirection.CREDIT,
          amountPoisha: fee,
          memo: "Prorated dispute fee",
        });
      const rounding = release - worker - fee;
      if (rounding > 0n)
        entries.push({
          accountType: LedgerAccountType.PLATFORM_FEE,
          accountRef: "platform",
          direction: LedgerDirection.CREDIT,
          amountPoisha: rounding,
          memo: "Dispute allocation rounding",
        });
    }
  }
  const status =
    refund === amount
      ? PaymentStatus.REFUNDED
      : refund > 0n
        ? PaymentStatus.PARTIALLY_REFUNDED
        : PaymentStatus.RELEASED;
  return {
    digital,
    entries,
    refundPoisha: refund,
    releasePoisha: release,
    status,
  };
}
