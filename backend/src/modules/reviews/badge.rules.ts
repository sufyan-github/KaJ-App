import { TrustLevel } from "@prisma/client";

import { hasTrust } from "../verification/trust-level";

export interface BadgeFacts {
  trustLevel: TrustLevel;
  completedJobs: number;
  ratingAverage: number;
  ratingCount: number;
  completionRateBps: number;
}

/**
 * Badges derived from these rules. Others (e.g. "business-verified") are
 * granted by staff and must not be revoked by the rule reconcile.
 */
export const RULE_BADGE_SLUGS: ReadonlySet<string> = new Set([
  "verified",
  "new-worker",
  "reliable",
  "top-rated",
  "experienced",
]);

export function eligibleBadgeSlugs(facts: BadgeFacts): string[] {
  return [
    // "Verified" means a reviewed national ID, never just a confirmed phone:
    // every account starts at PHONE trust.
    ...(hasTrust(facts.trustLevel, TrustLevel.IDENTITY) ? ["verified"] : []),
    ...(hasTrust(facts.trustLevel, TrustLevel.BUSINESS)
      ? ["business-verified"]
      : []),
    ...(facts.completedJobs <= 2 ? ["new-worker"] : []),
    ...(facts.completedJobs >= 5 && facts.completionRateBps >= 9000
      ? ["reliable"]
      : []),
    ...(facts.ratingCount >= 10 && facts.ratingAverage >= 4.8
      ? ["top-rated"]
      : []),
    ...(facts.completedJobs >= 25 ? ["experienced"] : []),
  ];
}
