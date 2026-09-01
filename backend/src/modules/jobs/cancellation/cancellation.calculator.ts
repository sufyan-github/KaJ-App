export type CancellationActor = "customer" | "worker";

export interface CancellationTier {
  minHoursBefore: number;
  customerPenalty: string;
  workerPenalty: string;
  refund: string;
}

export interface CancellationPolicy {
  tiers: CancellationTier[];
  emergencyReasonCodes: string[];
  emergencyBehaviour: string;
  strikesBeforeSuspension: number;
  strikeWindowDays: number;
}

export interface CancellationPreview {
  actor: CancellationActor;
  hoursBeforeStart: number;
  penaltyCode: string;
  refundCode: string;
  feePoisha: string;
  refundPoisha: string;
  reliabilityDelta: number;
  addsStrike: boolean;
  needsAdminReview: boolean;
  summaryBn: string;
}

export const defaultCancellationPolicy: CancellationPolicy = {
  tiers: [
    {
      minHoursBefore: 24,
      customerPenalty: "none",
      workerPenalty: "none",
      refund: "full",
    },
    {
      minHoursBefore: 6,
      customerPenalty: "warning",
      workerPenalty: "reliability_-2",
      refund: "full",
    },
    {
      minHoursBefore: 2,
      customerPenalty: "fee_25pct",
      workerPenalty: "reliability_-5",
      refund: "partial_75",
    },
    {
      minHoursBefore: 0,
      customerPenalty: "fee_50pct",
      workerPenalty: "reliability_-10,strike",
      refund: "partial_50",
    },
  ],
  emergencyReasonCodes: ["ILLNESS", "ACCIDENT", "BEREAVEMENT", "NATURAL_EVENT"],
  emergencyBehaviour: "no_penalty_pending_admin_review",
  strikesBeforeSuspension: 3,
  strikeWindowDays: 60,
};

export function calculateCancellation(input: {
  actor: CancellationActor;
  now: Date;
  startsAt: Date;
  agreedPricePoisha: bigint;
  reasonCode?: string;
  policy?: CancellationPolicy;
}): CancellationPreview {
  const policy = input.policy ?? defaultCancellationPolicy;
  const hoursBeforeStart = Math.max(
    0,
    (input.startsAt.getTime() - input.now.getTime()) / 3_600_000,
  );
  const emergency = Boolean(
    input.reasonCode && policy.emergencyReasonCodes.includes(input.reasonCode),
  );
  const tier =
    [...policy.tiers]
      .sort((a, b) => b.minHoursBefore - a.minHoursBefore)
      .find((item) => hoursBeforeStart >= item.minHoursBefore) ??
    policy.tiers.at(-1)!;
  const penaltyCode = emergency
    ? policy.emergencyBehaviour
    : input.actor === "customer"
      ? tier.customerPenalty
      : tier.workerPenalty;
  const refundCode = emergency ? "pending_admin_review" : tier.refund;
  const feePercent = emergency ? 0 : percentage(penaltyCode, "fee_");
  const refundPercent = emergency ? 100 : refundPercentage(refundCode);
  const reliabilityDelta = emergency ? 0 : reliability(penaltyCode);
  const addsStrike = !emergency && penaltyCode.includes("strike");
  const fee = percentOf(input.agreedPricePoisha, feePercent);
  const refund = percentOf(input.agreedPricePoisha, refundPercent);
  return {
    actor: input.actor,
    hoursBeforeStart: Math.round(hoursBeforeStart * 100) / 100,
    penaltyCode,
    refundCode,
    feePoisha: fee.toString(),
    refundPoisha: refund.toString(),
    reliabilityDelta,
    addsStrike,
    needsAdminReview: emergency,
    summaryBn: emergency
      ? "জরুরি কারণটি প্রশাসক যাচাই করবেন। এখন কোনো জরিমানা প্রয়োগ হবে না।"
      : summary(penaltyCode, refundPercent, feePercent),
  };
}

function percentage(code: string, prefix: string) {
  const match = code.match(new RegExp(`${prefix}(\\d+)pct`));
  return match ? Number(match[1]) : 0;
}

function refundPercentage(code: string) {
  if (code === "full") return 100;
  if (code === "none") return 0;
  const match = code.match(/partial_(\d+)/);
  return match ? Number(match[1]) : 0;
}

function reliability(code: string) {
  const match = code.match(/reliability_-(\d+)/);
  return match ? -Number(match[1]) : 0;
}

function percentOf(value: bigint, percent: number) {
  return (value * BigInt(percent) + 50n) / 100n;
}

function summary(code: string, refundPercent: number, feePercent: number) {
  const parts = [`ফেরত: ${refundPercent}%`];
  if (feePercent) parts.push(`বাতিল ফি: ${feePercent}%`);
  if (code === "warning") parts.push("অ্যাকাউন্টে সতর্কতা যোগ হবে");
  const delta = reliability(code);
  if (delta) parts.push(`নির্ভরযোগ্যতা ${delta} পয়েন্ট কমবে`);
  if (code.includes("strike")) parts.push("একটি স্ট্রাইক যোগ হবে");
  return parts.join("। ");
}
