import { HttpStatus } from "@nestjs/common";

import { ApiErrorDescriptor } from "../../common/api/api-envelope";
import { KajHttpException } from "../../common/errors/kaj-http.exception";
import { RateLimitException } from "../../common/errors/rate-limit.exception";

const descriptor = (
  fields: Pick<ApiErrorDescriptor, "code" | "message" | "messageKey"> &
    Partial<ApiErrorDescriptor>,
): ApiErrorDescriptor => ({
  action: null,
  details: [],
  field: null,
  retryable: false,
  ...fields,
});

/** AI errors (codes in docs/api/error-codes.md and docs/api/ai.md, bn + en). */
export const aiErrors = {
  /** AI_ENABLED is off or ANTHROPIC_API_KEY is missing: hide AI in the app. */
  disabled: () =>
    new KajHttpException(
      descriptor({
        code: "AI_DISABLED",
        message: "AI features are not available right now.",
        messageKey: "error.ai.disabled",
      }),
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  /** The model provider failed or timed out after retries. */
  unavailable: () =>
    new KajHttpException(
      descriptor({
        code: "AI_UNAVAILABLE",
        message: "The AI assistant is busy. Please try again in a few minutes.",
        messageKey: "error.ai.unavailable",
        retryable: true,
      }),
      HttpStatus.SERVICE_UNAVAILABLE,
    ),
  consentRequired: (currentVersion: number) =>
    new KajHttpException(
      descriptor({
        code: "AI_CONSENT_REQUIRED",
        message: "Allow KAAJ to use AI with your information first.",
        messageKey: "error.ai.consent_required",
        details: [{ currentVersion }],
        action: { type: "AI_CONSENT", target: "POST /ai/consent" },
      }),
      HttpStatus.FORBIDDEN,
    ),
  consentVersion: (currentVersion: number) =>
    new KajHttpException(
      descriptor({
        code: "AI_CONSENT_VERSION_MISMATCH",
        message: "The consent text has changed. Show the latest version.",
        messageKey: "error.ai.consent_version",
        field: "version",
        details: [{ currentVersion }],
      }),
      HttpStatus.BAD_REQUEST,
    ),
  ideaConsentRequired: () =>
    new KajHttpException(
      descriptor({
        code: "AI_IDEA_CONSENT_REQUIRED",
        message: "Turn on AI analysis for this idea first.",
        messageKey: "error.ai.idea_consent_required",
        field: "aiConsent",
        action: { type: "UPDATE_IDEA", target: "PATCH /ideas/:id" },
      }),
      HttpStatus.CONFLICT,
    ),
  /** The model declined, or its answer failed validation. Nothing stored. */
  declined: () =>
    new KajHttpException(
      descriptor({
        code: "AI_DECLINED",
        message:
          "The AI assistant couldn't analyse this. Edit the text and try again.",
        messageKey: "error.ai.declined",
      }),
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  quotaExceeded: (limit: number, retryAfterSeconds: number) =>
    new RateLimitException(
      descriptor({
        code: "AI_QUOTA_EXCEEDED",
        message: `You have used today's ${limit} AI requests for this feature. Try again tomorrow.`,
        messageKey: "error.ai.quota_exceeded",
        details: [{ limit }],
        retryable: true,
      }),
      retryAfterSeconds,
    ),
};
