import { HttpStatus } from "@nestjs/common";

import { KajHttpException } from "../../common/errors/kaj-http.exception";

/**
 * R1 (A8): each config key has a shape; a value that does not fit is refused
 * before it is saved, previewed or restored. Problems are returned as
 * "field: rule" strings. A key without rules cannot be changed.
 */
type Rule = (value: unknown) => string | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const integer =
  (min: number, max: number): Rule =>
  (value) =>
    Number.isInteger(value) &&
    (value as number) >= min &&
    (value as number) <= max
      ? null
      : `a whole number from ${min} to ${max}`;
const number =
  (min: number, max: number): Rule =>
  (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
      ? null
      : `a number from ${min} to ${max}`;
const oneOf =
  (...allowed: string[]): Rule =>
  (value) =>
    typeof value === "string" && allowed.includes(value)
      ? null
      : `one of ${allowed.join(", ")}`;
const text: Rule = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 200
    ? null
    : "a non-empty text";
const nullable =
  (rule: Rule): Rule =>
  (value) =>
    value === null ? null : rule(value);
const textList: Rule = (value) =>
  Array.isArray(value) && value.every((item) => text(item) === null)
    ? null
    : "a list of texts";

const POISHA_MAX = 100_000_000_00;

function object(
  value: unknown,
  fields: Record<string, Rule>,
  prefix = "",
): string[] {
  if (!isRecord(value)) return [`${prefix || "value"}: an object`];
  const problems: string[] = [];
  for (const key of Object.keys(value))
    if (!(key in fields)) problems.push(`${prefix}${key}: not a known field`);
  for (const [key, rule] of Object.entries(fields)) {
    const problem = rule(value[key]);
    if (problem) problems.push(`${prefix}${key}: ${problem}`);
  }
  return problems;
}

const RULES: Record<string, (value: unknown) => string[]> = {
  "platform.fees": (value) => {
    const problems = object(value, {
      feeBps: integer(0, 10_000),
      minFeePoisha: integer(0, POISHA_MAX),
      maxFeePoisha: nullable(integer(0, POISHA_MAX)),
      payer: oneOf("worker", "customer", "split"),
      currency: oneOf("BDT"),
    });
    if (
      !problems.length &&
      isRecord(value) &&
      value.maxFeePoisha !== null &&
      (value.maxFeePoisha as number) < (value.minFeePoisha as number)
    )
      problems.push("maxFeePoisha: at least minFeePoisha");
    return problems;
  },
  "matching.weights": (value) => {
    const weight = number(0, 1);
    const problems = object(value, {
      skill: weight,
      location: weight,
      availability: weight,
      budget: weight,
      experience: weight,
      rating: weight,
      reliability: weight,
    });
    if (
      !problems.length &&
      isRecord(value) &&
      Object.values(value).every((item) => item === 0)
    )
      problems.push("value: at least one weight above 0");
    return problems;
  },
  "cancellation.policy": (value) => {
    const problems = object(value, {
      tiers: (tiers) =>
        Array.isArray(tiers) && tiers.length > 0 && tiers.length <= 10
          ? null
          : "a list of 1 to 10 tiers",
      emergencyReasonCodes: textList,
      emergencyBehaviour: text,
      strikesBeforeSuspension: integer(1, 20),
      strikeWindowDays: integer(1, 365),
    });
    if (isRecord(value) && Array.isArray(value.tiers)) {
      value.tiers.forEach((tier, index) =>
        problems.push(
          ...object(
            tier,
            {
              minHoursBefore: number(0, 24 * 30),
              customerPenalty: text,
              workerPenalty: text,
              refund: text,
            },
            `tiers[${index}].`,
          ),
        ),
      );
      if (
        value.tiers.length &&
        !value.tiers.some((tier) => isRecord(tier) && tier.minHoursBefore === 0)
      )
        problems.push("tiers: one tier with minHoursBefore 0");
    }
    return problems;
  },
  "assignment.settings": (value) =>
    object(value, {
      confirmWindowMinutes: integer(1, 7 * 24 * 60),
      autoConfirmHours: integer(1, 30 * 24),
    }),
  "attendance.settings": (value) =>
    object(value, {
      geofenceRadiusM: integer(10, 5_000),
      checkinWindowMinutes: integer(0, 24 * 60),
      maxAccuracyM: integer(1, 5_000),
      maxOfflineSyncMinutes: integer(0, 24 * 60),
      maxClockSkewSeconds: integer(0, 60 * 60),
      consentVersion: text,
    }),
};

export function validateConfigValue(key: string, value: unknown): string[] {
  const rules = RULES[key];
  if (!rules) return [`${key}: this setting has no rules and can't be changed`];
  return rules(value);
}

/** 400 CONFIG_INVALID with one detail per problem. */
export function assertValidConfig(key: string, value: unknown): void {
  const problems = validateConfigValue(key, value);
  if (!problems.length) return;
  throw new KajHttpException(
    {
      action: null,
      code: "CONFIG_INVALID",
      details: problems.map((problem) => {
        const [field, rule] = problem.split(": ");
        return { field: field!, rules: [rule ?? problem] };
      }),
      field: "value",
      message: `The value doesn't fit ${key}: ${problems.join("; ")}.`,
      messageKey: "error.admin.config_invalid",
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );
}
