import { TrustLevel, VerificationKind } from "@prisma/client";

const levels: readonly TrustLevel[] = [
  TrustLevel.NONE,
  TrustLevel.PHONE,
  TrustLevel.IDENTITY,
  TrustLevel.SKILL,
  TrustLevel.BUSINESS,
];

export function trustForVerification(kind: VerificationKind): TrustLevel {
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
  if (kind === VerificationKind.BUSINESS) return TrustLevel.SKILL;
  if (kind === VerificationKind.SKILL) return TrustLevel.IDENTITY;
  if (kind === VerificationKind.IDENTITY) return TrustLevel.PHONE;
  return TrustLevel.NONE;
}
