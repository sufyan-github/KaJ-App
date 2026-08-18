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

export function invalidPhoneError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "AUTH_INVALID_PHONE",
      "error.auth.invalid_phone",
      "Enter a valid Bangladesh phone number.",
      "phone",
    ),
    HttpStatus.BAD_REQUEST,
  );
}

export function otpRateLimitError(
  retryAfterSeconds: number,
): RateLimitException {
  return new RateLimitException(
    {
      ...descriptor(
        "OTP_RATE_LIMITED",
        "error.auth.otp_rate_limited",
        "Too many OTP requests. Try again later.",
      ),
      retryable: true,
    },
    retryAfterSeconds,
  );
}

export function otpNotFoundError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "OTP_CHALLENGE_NOT_FOUND",
      "error.auth.otp_challenge_not_found",
      "OTP challenge not found.",
    ),
    HttpStatus.NOT_FOUND,
  );
}

export function otpExpiredError(): KajHttpException {
  return new KajHttpException(
    descriptor("OTP_EXPIRED", "error.auth.otp_expired", "The OTP has expired."),
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

export function otpInvalidError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "OTP_INVALID",
      "error.auth.otp_invalid",
      "The OTP is incorrect.",
      "code",
    ),
    HttpStatus.UNAUTHORIZED,
  );
}

export function otpAttemptsExceededError(): RateLimitException {
  return new RateLimitException(
    descriptor(
      "OTP_ATTEMPTS_EXCEEDED",
      "error.auth.otp_attempts_exceeded",
      "This OTP challenge has too many failed attempts.",
    ),
    300,
  );
}

export function otpAlreadyUsedError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "OTP_ALREADY_USED",
      "error.auth.otp_already_used",
      "This OTP challenge has already been used.",
    ),
    HttpStatus.CONFLICT,
  );
}

export function refreshInvalidError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "REFRESH_TOKEN_INVALID",
      "error.auth.refresh_invalid",
      "The refresh token is invalid or expired.",
    ),
    HttpStatus.UNAUTHORIZED,
  );
}

export function refreshReuseError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "REFRESH_REUSE_DETECTED",
      "error.auth.refresh_reuse",
      "This session is no longer valid. Sign in again.",
    ),
    HttpStatus.UNAUTHORIZED,
  );
}

export function accessTokenInvalidError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "ACCESS_TOKEN_INVALID",
      "error.auth.access_invalid",
      "The access token is missing, invalid, or expired.",
    ),
    HttpStatus.UNAUTHORIZED,
  );
}

export function accountUnavailableError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "ACCOUNT_UNAVAILABLE",
      "error.auth.account_unavailable",
      "This account is not available.",
    ),
    HttpStatus.FORBIDDEN,
  );
}

export function deviceNotFoundError(): KajHttpException {
  return new KajHttpException(
    descriptor(
      "DEVICE_NOT_FOUND",
      "error.auth.device_not_found",
      "Device not found.",
    ),
    HttpStatus.NOT_FOUND,
  );
}
