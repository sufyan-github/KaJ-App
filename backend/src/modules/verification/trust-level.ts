import { TrustLevel, VerificationKind } from "@prisma/client";

const levels: readonly TrustLevel[] = [
  TrustLevel.NONE,
  TrustLevel.PHONE,
  TrustLevel.IDENTITY,
  TrustLevel.SKILL,
  TrustLevel.BUSINESS,
];

/**
 * The trust level an approved request of this kind grants. A MENTOR
 * approval grants the mentor capability, and a BUSINESS approval verifies
 * one business (P2.6) — neither is a step on the person's trust ladder
 * (a verified business says nothing about the owner's skills).
 */
export function trustForVerification(
  kind: VerificationKind,
): TrustLevel | null {
  if (kind === VerificationKind.MENTOR) return null;
  if (kind === VerificationKind.BUSINESS) return null;
  return TrustLevel[kind];
}

export function highestTrust(
  current: TrustLevel,
  candidate: TrustLevel,
): TrustLevel {
  return levels.indexOf(candidate) > levels.indexOf(current)
    ? candidate
    : current;
}

export function hasTrust(current: TrustLevel, required: TrustLevel): boolean {
  return levels.indexOf(current) >= levels.indexOf(required);
}

export function prerequisiteFor(kind: VerificationKind): TrustLevel {
  // P2.6: a business owner proves who they are, not a trade skill.
  if (kind === VerificationKind.BUSINESS) return TrustLevel.IDENTITY;
  if (kind === VerificationKind.SKILL) return TrustLevel.IDENTITY;
  if (kind === VerificationKind.MENTOR) return TrustLevel.IDENTITY;
  if (kind === VerificationKind.IDENTITY) return TrustLevel.PHONE;
  return TrustLevel.NONE;
}
