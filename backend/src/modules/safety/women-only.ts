import { ConflictException } from "@nestjs/common";
import { Gender, Prisma, TrustLevel } from "@prisma/client";

import { hasTrust } from "../verification/trust-level";

/**
 * API-9: women-only spaces (groups, sessions) are for women whose identity
 * was verified (NID and selfie). The profile's gender alone is self-declared,
 * and it locks once identity is verified (see GENDER_LOCKED).
 */
export const VERIFIED_LEVELS: TrustLevel[] = [
  TrustLevel.IDENTITY,
  TrustLevel.SKILL,
  TrustLevel.BUSINESS,
];

/** Who a host may invite or add to a women-only space. */
export const verifiedWomanProfile = {
  gender: Gender.FEMALE,
  trust_level: { in: VERIFIED_LEVELS },
} satisfies Prisma.ProfileWhereInput;

/**
 * Throws `notWoman()` for anyone whose profile is not female, and 409
 * IDENTITY_REQUIRED for a woman who has not verified her identity yet.
 */
export function assertVerifiedWoman(
  profile: { gender: Gender | null; trust_level: TrustLevel } | null,
  notWoman: () => Error,
): void {
  if (profile?.gender !== Gender.FEMALE) throw notWoman();
  if (!hasTrust(profile.trust_level, TrustLevel.IDENTITY))
    throw new ConflictException({
      code: "IDENTITY_REQUIRED",
      message:
        "Verify your identity (NID and selfie) to join women-only groups and sessions.",
      messageKey: "error.women_only.identity_required",
    });
}

export const genderLocked = () =>
  new ConflictException({
    code: "GENDER_LOCKED",
    message:
      "Your gender can't be changed after identity verification. Contact support to correct it.",
    messageKey: "error.profile.gender_locked",
    field: "gender",
  });
