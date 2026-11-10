import { RoleMode, TrustLevel } from "@prisma/client";

import { hasTrust } from "../verification/trust-level";

export type CompletenessItem =
  "PHOTO" | "BIO" | "AREA" | "SKILLS" | "IDENTITY" | "TRAINING";

export interface CompletenessInput {
  activeRole: RoleMode;
  hasPhoto: boolean;
  hasBio: boolean;
  hasArea: boolean;
  skillCount: number;
  trustLevel: TrustLevel;
  validCertificateCount: number;
}

const workerWeights: ReadonlyArray<[CompletenessItem, number]> = [
  ["PHOTO", 15],
  ["BIO", 15],
  ["AREA", 15],
  ["SKILLS", 20],
  ["IDENTITY", 20],
  ["TRAINING", 15],
];

const customerWeights: ReadonlyArray<[CompletenessItem, number]> = [
  ["PHOTO", 30],
  ["AREA", 40],
  ["IDENTITY", 30],
];

/** Deterministic; `missing` keeps the weight order so the app can list it. */
export function profileCompleteness(input: CompletenessInput): {
  percent: number;
  missing: CompletenessItem[];
} {
  const done: Record<CompletenessItem, boolean> = {
    PHOTO: input.hasPhoto,
    BIO: input.hasBio,
    AREA: input.hasArea,
    SKILLS: input.skillCount > 0,
    IDENTITY: hasTrust(input.trustLevel, TrustLevel.IDENTITY),
    TRAINING: input.validCertificateCount > 0,
  };
  const weights =
    input.activeRole === RoleMode.WORKER ? workerWeights : customerWeights;
  let percent = 0;
  const missing: CompletenessItem[] = [];
  for (const [item, weight] of weights) {
    if (done[item]) percent += weight;
    else missing.push(item);
  }
  return { percent, missing };
}
