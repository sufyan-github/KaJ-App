import { OpportunityType, ParticipantTerms } from "@prisma/client";

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

function taka(poisha: bigint): string {
  const whole = poisha / 100n;
  const rest = poisha % 100n;
  return rest === 0n
    ? whole.toString()
    : `${whole}.${rest.toString().padStart(2, "0")}`;
}

function bnDigits(value: string): string {
  return value.replace(/\d/gu, (digit) => BN_DIGITS[Number(digit)]!);
}

/** The terms a learner agrees to, in English and Bangla. */
export function termsText(input: {
  terms: ParticipantTerms;
  feePoisha: bigint | null;
  stipendPoisha: bigint | null;
}): { en: string; bn: string } {
  switch (input.terms) {
    case ParticipantTerms.FREE:
      return { en: "Free", bn: "বিনামূল্যে" };
    case ParticipantTerms.PAID_BY_PARTICIPANT: {
      const amount = taka(input.feePoisha ?? 0n);
      return { en: `Fee: ৳${amount}`, bn: `ফি: ৳${bnDigits(amount)}` };
    }
    case ParticipantTerms.STIPEND: {
      const amount = taka(input.stipendPoisha ?? 0n);
      return {
        en: `Stipend: ৳${amount}`,
        bn: `ভাতা: ৳${bnDigits(amount)}`,
      };
    }
    case ParticipantTerms.UNPAID:
      return {
        en: "Unpaid (no fee, no stipend)",
        bn: "অবৈতনিক (ফি বা ভাতা নেই)",
      };
  }
}

export const OPPORTUNITY_LABEL: Record<
  Exclude<OpportunityType, "WORK">,
  { en: string; bn: string }
> = {
  TRAINING: { en: "Training", bn: "প্রশিক্ষণ" },
  APPRENTICESHIP: { en: "Apprenticeship", bn: "শিক্ষানবিশি" },
};
