export type FeePayer = "customer" | "worker" | "split";

export interface FeeRuleValue {
  feeBps: number;
  maxFeePoisha: bigint | null;
  minFeePoisha: bigint;
  payer: FeePayer;
  scopeKey: string;
}

export interface FeeResolutionContext {
  categoryId: string;
  global: FeeRuleValue;
  rules: ReadonlyMap<string, FeeRuleValue>;
  tier?: string | null;
  userId: string;
}

export interface MoneyBreakdown {
  agreedPoisha: bigint;
  customerPaysPoisha: bigint;
  feePoisha: bigint;
  workerReceivesPoisha: bigint;
}

export function resolveFeeRule(context: FeeResolutionContext): FeeRuleValue {
  const keys = [
    `USER:${context.userId}`,
    context.tier ? `TIER:${context.tier}` : null,
    `CATEGORY:${context.categoryId}`,
    "GLOBAL:*",
  ];
  for (const key of keys) {
    if (!key) continue;
    const rule = context.rules.get(key);
    if (rule) return rule;
  }
  return context.global;
}

export function calculateBreakdown(
  agreedPoisha: bigint,
  rule: FeeRuleValue,
): MoneyBreakdown {
  if (agreedPoisha <= 0n) throw new Error("Agreed amount must be positive");
  if (!Number.isInteger(rule.feeBps) || rule.feeBps < 0 || rule.feeBps > 10_000)
    throw new Error("Fee basis points must be between 0 and 10000");

  let fee = (agreedPoisha * BigInt(rule.feeBps) + 5_000n) / 10_000n;
  if (fee < rule.minFeePoisha) fee = rule.minFeePoisha;
  if (rule.maxFeePoisha !== null && fee > rule.maxFeePoisha)
    fee = rule.maxFeePoisha;
  if (fee > agreedPoisha && rule.payer !== "customer") fee = agreedPoisha;

  if (rule.payer === "customer") {
    return {
      agreedPoisha,
      customerPaysPoisha: agreedPoisha + fee,
      feePoisha: fee,
      workerReceivesPoisha: agreedPoisha,
    };
  }
  if (rule.payer === "split") {
    const customerShare = (fee + 1n) / 2n;
    const workerShare = fee - customerShare;
    return {
      agreedPoisha,
      customerPaysPoisha: agreedPoisha + customerShare,
      feePoisha: fee,
      workerReceivesPoisha: agreedPoisha - workerShare,
    };
  }
  return {
    agreedPoisha,
    customerPaysPoisha: agreedPoisha,
    feePoisha: fee,
    workerReceivesPoisha: agreedPoisha - fee,
  };
}

export function ledgerBalances(
  entries: readonly { amountPoisha: bigint; direction: "DEBIT" | "CREDIT" }[],
): boolean {
  const totals = entries.reduce(
    (value, entry) => {
      value[entry.direction] += entry.amountPoisha;
      return value;
    },
    { CREDIT: 0n, DEBIT: 0n },
  );
  return totals.DEBIT === totals.CREDIT;
}
