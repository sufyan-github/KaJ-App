import { BadRequestException } from "@nestjs/common";

/**
 * P3.7: no gender-restricted job posts. KAAJ lets women find safe,
 * flexible work (home-based, remote, women-only groups and sessions), but a
 * job itself may not exclude anyone by gender. Catches the common phrasings
 * in English and Bangla; it is a guard rail, not a complete classifier.
 */
const GENDER_EN =
  "(?:women|woman|female|females|ladies|lady|girls?|men|man|male|males|boys?)";
const GENDER_BN = "(?:মহিলা|নারী|মেয়ে|পুরুষ|ছেলে)";
const PATTERNS: readonly RegExp[] = [
  new RegExp(`\\b(?:only|just)\\s+${GENDER_EN}\\b`, "iu"),
  new RegExp(`\\b${GENDER_EN}\\s+(?:only|candidates? only)\\b`, "iu"),
  new RegExp(`\\bno\\s+${GENDER_EN}\\b`, "iu"),
  new RegExp(
    `\\b${GENDER_EN}\\s+(?:need not|should not|cannot|can't)\\s+apply\\b`,
    "iu",
  ),
  new RegExp(`শুধু(?:মাত্র)?\\s*${GENDER_BN}`, "u"),
  new RegExp(
    `${GENDER_BN}\\s*(?:প্রার্থী\\s*)?(?:নয়|নিষেধ|আবেদন করবেন না)`,
    "u",
  ),
];

export function genderRestriction(text: string): boolean {
  return PATTERNS.some((pattern) => pattern.test(text));
}

export function assertNoGenderRestriction(input: {
  title: string;
  description: string;
}) {
  for (const field of ["title", "description"] as const)
    if (genderRestriction(input[field]))
      throw new BadRequestException({
        code: "GENDER_RESTRICTION_NOT_ALLOWED",
        message:
          "Jobs can't be limited to one gender. Describe the work and the conditions instead.",
        messageKey: "error.job.gender_restriction",
        field,
      });
}
