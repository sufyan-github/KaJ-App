import { HttpStatus } from "@nestjs/common";

import { ApiErrorDescriptor } from "../../common/api/api-envelope";
import { KajHttpException } from "../../common/errors/kaj-http.exception";

function error(
  code: string,
  message: string,
  status: HttpStatus,
): KajHttpException {
  const descriptor: ApiErrorDescriptor = {
    action: null,
    code,
    details: [],
    field: null,
    message,
    messageKey: `error.admin.${code.toLowerCase()}`,
    retryable: false,
  };
  return new KajHttpException(descriptor, status);
}

export const invalidAdminCredentialsError = () =>
  error(
    "ADMIN_CREDENTIALS_INVALID",
    "Email or password is incorrect.",
    HttpStatus.UNAUTHORIZED,
  );
export const invalidAdminChallengeError = () =>
  error(
    "ADMIN_CHALLENGE_INVALID",
    "The verification challenge is invalid or expired.",
    HttpStatus.UNAUTHORIZED,
  );
export const invalidAdminTotpError = () =>
  error(
    "ADMIN_TOTP_INVALID",
    "The verification code is incorrect.",
    HttpStatus.UNAUTHORIZED,
  );
export const adminSessionInvalidError = () =>
  error(
    "ADMIN_SESSION_INVALID",
    "Your admin session has expired. Sign in again.",
    HttpStatus.UNAUTHORIZED,
  );
