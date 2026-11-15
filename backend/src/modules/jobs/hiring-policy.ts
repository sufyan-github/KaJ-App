import { TrustLevel } from "@prisma/client";

import { hasTrust } from "../verification/trust-level";

/** The category safety fields (spec D11/D12) that are enforced today. */
export interface CategoryHiringPolicy {
  min_age: number;
  requires_identity: boolean;
  requires_certificate: boolean;
  requires_licence: boolean;
  requires_poster_identity: boolean;
}

export type HiringRequirement =
  | { type: "MIN_AGE"; minAge: number }
  | { type: "BIRTH_YEAR"; minAge: number }
  | { type: "IDENTITY" }
  | { type: "CERTIFICATE" }
  | { type: "LICENCE" }
  | { type: "POSTER_IDENTITY" };

/** The platform default; stricter categories (e.g. childcare 21) need a known birth year. */
const DEFAULT_MIN_AGE = 18;

/**
 * What a worker still lacks to take work in a category. Empty means eligible.
 *
 * Certificates and licences are checked against the existing account-level
 * SKILL verification until per-skill credentials exist (Phase 03); that is
 * stricter than nothing and never weaker than the spec.
 */
export function workerRequirementGaps(
  policy: CategoryHiringPolicy,
  worker: { birthYear: number | null; trustLevel: TrustLevel },
  now: Date,
): HiringRequirement[] {
  const gaps: HiringRequirement[] = [];
  if (worker.birthYear === null) {
    if (policy.min_age > DEFAULT_MIN_AGE)
      gaps.push({ type: "BIRTH_YEAR", minAge: policy.min_age });
  } else if (now.getUTCFullYear() - worker.birthYear < policy.min_age) {
    // Birth year only: someone may be up to a year younger than this
    // estimate, so it errs towards eligibility by at most one year.
    gaps.push({ type: "MIN_AGE", minAge: policy.min_age });
  }
  if (
    policy.requires_identity &&
    !hasTrust(worker.trustLevel, TrustLevel.IDENTITY)
  )
    gaps.push({ type: "IDENTITY" });
  if (
    policy.requires_certificate &&
    !hasTrust(worker.trustLevel, TrustLevel.SKILL)
  )
    gaps.push({ type: "CERTIFICATE" });
  if (policy.requires_licence && !hasTrust(worker.trustLevel, TrustLevel.SKILL))
    gaps.push({ type: "LICENCE" });
  return gaps;
}

/** What a poster lacks to post in a category. */
export function posterRequirementGaps(
  policy: CategoryHiringPolicy,
  poster: { trustLevel: TrustLevel },
): HiringRequirement[] {
  return policy.requires_poster_identity &&
    !hasTrust(poster.trustLevel, TrustLevel.IDENTITY)
    ? [{ type: "POSTER_IDENTITY" }]
    : [];
}
