import { BusinessStage, Prisma, VerificationStatus } from "@prisma/client";

/** How each stage reads in the app. An idea is never shown as verified. */
export const STAGE_LABEL: Record<BusinessStage, { en: string; bn: string }> = {
  IDEA: { en: "Idea stage", bn: "আইডিয়া পর্যায়" },
  INFORMAL: { en: "Running informally", bn: "অনানুষ্ঠানিকভাবে চলছে" },
  REGISTERED: { en: "Registered business", bn: "নিবন্ধিত ব্যবসা" },
};

/** The verified badge: an approved verification of a REGISTERED business. */
export function isVerifiedBusiness(business: {
  stage: BusinessStage;
  verification_status: VerificationStatus;
}): boolean {
  return (
    business.stage === BusinessStage.REGISTERED &&
    business.verification_status === VerificationStatus.APPROVED
  );
}

/** A business anyone may see (public, not suspended, not deleted). */
export const PUBLIC_BUSINESS = {
  is_public: true,
  suspended_at: null,
  deleted_at: null,
} as const satisfies Prisma.BusinessProfileWhereInput;
