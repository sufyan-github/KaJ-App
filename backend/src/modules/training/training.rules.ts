import { createHash, randomBytes, randomInt } from "node:crypto";

export const ATTEMPT_DURATION_MS = 20 * 60_000;
export const MAX_FAILED_ATTEMPTS = 3;
export const FAILED_ATTEMPT_WINDOW_MS = 24 * 60 * 60_000;

// No 0/O, 1/I/L: codes are read aloud and typed from a phone screen.
export const CERTIFICATE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CERTIFICATE_CODE_LENGTH = 10;
const CERTIFICATE_CODE_PATTERN = new RegExp(
  `^[${CERTIFICATE_CODE_ALPHABET}]{${CERTIFICATE_CODE_LENGTH}}$`,
);

export interface TrainingOption {
  id: string;
  en: string;
  bn: string;
}

export interface GradableQuestion {
  id: string;
  options: readonly TrainingOption[];
  correctOptionId: string;
  explanationEn: string;
  explanationBn: string;
}

export interface SubmittedAnswer {
  questionId: string;
  optionId: string;
}

export class TrainingAnswerError extends Error {}

export interface AttemptAllowance {
  attemptsLeftToday: number;
  nextAttemptAt: Date | null;
}

/**
 * Only failed, submitted attempts count. The limit lifts when the third most
 * recent failure inside the window leaves it.
 */
export function attemptAllowance(
  failedAt: readonly Date[],
  now: Date,
): AttemptAllowance {
  const windowStart = now.getTime() - FAILED_ATTEMPT_WINDOW_MS;
  const recent = failedAt
    .map((date) => date.getTime())
    .filter((time) => time > windowStart)
    .sort((a, b) => b - a);
  if (recent.length < MAX_FAILED_ATTEMPTS) {
    return {
      attemptsLeftToday: MAX_FAILED_ATTEMPTS - recent.length,
      nextAttemptAt: null,
    };
  }
  const releasing = recent[MAX_FAILED_ATTEMPTS - 1]!;
  return {
    attemptsLeftToday: 0,
    nextAttemptAt: new Date(releasing + FAILED_ATTEMPT_WINDOW_MS),
  };
}

/** Each served question may be answered at most once; unknown ids are rejected. */
export function validateAnswers(
  served: readonly GradableQuestion[],
  answers: readonly SubmittedAnswer[],
): Map<string, string> {
  const byId = new Map(served.map((question) => [question.id, question]));
  const chosen = new Map<string, string>();
  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (!question) {
      throw new TrainingAnswerError("An answer refers to an unknown question.");
    }
    if (chosen.has(answer.questionId)) {
      throw new TrainingAnswerError("A question can be answered only once.");
    }
    if (!question.options.some((option) => option.id === answer.optionId)) {
      throw new TrainingAnswerError("An answer refers to an unknown option.");
    }
    chosen.set(answer.questionId, answer.optionId);
  }
  return chosen;
}

export function gradeAttempt(
  served: readonly GradableQuestion[],
  answers: readonly SubmittedAnswer[],
  passMarkPct: number,
) {
  const chosen = validateAnswers(served, answers);
  const results = served.map((question) => ({
    questionId: question.id,
    correct: chosen.get(question.id) === question.correctOptionId,
    correctOptionId: question.correctOptionId,
    explanationEn: question.explanationEn,
    explanationBn: question.explanationBn,
  }));
  const correctCount = results.filter((result) => result.correct).length;
  const scorePct =
    served.length === 0 ? 0 : Math.round((correctCount / served.length) * 100);
  return {
    correctCount,
    scorePct,
    passed: served.length > 0 && scorePct >= passMarkPct,
    results,
  };
}

/** Uniform random sample without replacement, in random order. */
export function sampleQuestionIds(
  ids: readonly string[],
  count: number,
  random: (max: number) => number = randomInt,
): string[] {
  const pool = [...ids];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    [pool[index], pool[swap]] = [pool[swap]!, pool[index]!];
  }
  return pool.slice(0, Math.max(0, count));
}

/**
 * Stable per attempt, so a re-opened attempt shows the same option order,
 * but different across attempts.
 */
export function shuffleOptionsForAttempt<T extends { id: string }>(
  options: readonly T[],
  attemptId: string,
  questionId: string,
): T[] {
  const key = (option: T) =>
    createHash("sha256")
      .update(`${attemptId}:${questionId}:${option.id}`)
      .digest("hex");
  return [...options]
    .map((option) => ({ option, key: key(option) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ option }) => option);
}

export function generateCertificateCode(
  bytes: (size: number) => Buffer = randomBytes,
): string {
  const alphabet = CERTIFICATE_CODE_ALPHABET;
  // Rejection sampling keeps every character equally likely.
  const limit = 256 - (256 % alphabet.length);
  let code = "";
  while (code.length < CERTIFICATE_CODE_LENGTH) {
    for (const byte of bytes(CERTIFICATE_CODE_LENGTH * 2)) {
      if (byte >= limit) continue;
      code += alphabet[byte % alphabet.length];
      if (code.length === CERTIFICATE_CODE_LENGTH) break;
    }
  }
  return code;
}

export async function generateUniqueCertificateCode(
  isTaken: (code: string) => Promise<boolean>,
  generate: () => string = generateCertificateCode,
  maxAttempts = 5,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = generate();
    if (!(await isTaken(code))) return code;
  }
  throw new Error("Could not allocate a unique certificate code.");
}

export function normalizeCertificateCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return CERTIFICATE_CODE_PATTERN.test(code) ? code : null;
}

export function parseOptions(value: unknown): TrainingOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { id, en, bn } = item as Record<string, unknown>;
    return typeof id === "string" &&
      typeof en === "string" &&
      typeof bn === "string"
      ? [{ id, en, bn }]
      : [];
  });
}

export function parseQuestionIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
