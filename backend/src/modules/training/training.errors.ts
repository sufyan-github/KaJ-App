import { HttpStatus } from "@nestjs/common";

import { ApiErrorDescriptor } from "../../common/api/api-envelope";
import { KajHttpException } from "../../common/errors/kaj-http.exception";
import { RateLimitException } from "../../common/errors/rate-limit.exception";

function descriptor(
  code: string,
  messageKey: string,
  message: string,
  field: string | null = null,
): ApiErrorDescriptor {
  return {
    action: null,
    code,
    details: [],
    field,
    message,
    messageKey,
    retryable: false,
  };
}

export function trainingAlreadyCertifiedError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "TRAINING_ALREADY_CERTIFIED",
      "error.training.already_certified",
      "You already passed this test.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function trainingAttemptLimitError(
  nextAttemptAt: Date,
): KajHttpException {
  return new KajHttpException(
    {
      ...descriptor(
        "TRAINING_ATTEMPT_LIMIT",
        "error.training.attempt_limit",
        "You can try this test again later.",
      ),
      details: [{ nextAttemptAt: nextAttemptAt.toISOString() }],
      retryable: true,
    },
    HttpStatus.CONFLICT,
  );
}

export function trainingAttemptExpiredError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "TRAINING_ATTEMPT_EXPIRED",
      "error.training.attempt_expired",
      "This test has expired. Start a new one.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function trainingAttemptSubmittedError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "TRAINING_ATTEMPT_SUBMITTED",
      "error.training.attempt_submitted",
      "This test was already submitted.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function trainingUnavailableError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "TRAINING_TEST_UNAVAILABLE",
      "error.training.test_unavailable",
      "This test is not available right now.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function trainingAnswerInvalidError(message: string): KajHttpException {
  return new KajHttpException(
    descriptor(
      "TRAINING_ANSWER_INVALID",
      "error.training.answer_invalid",
      message,
      "answers",
    ),
    HttpStatus.BAD_REQUEST,
  );
}

export function certificateLookupRateLimitError(
  retryAfterSeconds: number,
): RateLimitException {
  return new RateLimitException(
    {
      ...descriptor(
        "RATE_LIMITED",
        "error.common.rate_limited",
        "Too many requests. Try again later.",
      ),
      retryable: true,
    },
    retryAfterSeconds,
  );
}

/** A locked-order course: finish the earlier lessons' questions first. */
export function lessonLockedError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "LESSON_LOCKED",
      "error.training.lesson_locked",
      "Finish the previous lesson's questions first.",
    ),
    HttpStatus.CONFLICT,
  );
}

/** A locked-order course: every lesson's checkpoint before the final test. */
export function testLockedError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "TEST_LOCKED",
      "error.training.test_locked",
      "Pass every lesson's questions before the final test. If you don't see them, update the app.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function checkpointUnavailableError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "CHECKPOINT_UNAVAILABLE",
      "error.training.checkpoint_unavailable",
      "This lesson has no questions to answer.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function checkpointAnswersInvalidError(
  message: string,
): KajHttpException {
  return new KajHttpException(
    descriptor(
      "CHECKPOINT_ANSWERS_INVALID",
      "error.training.checkpoint_answers_invalid",
      message,
      "answers",
    ),
    HttpStatus.BAD_REQUEST,
  );
}
