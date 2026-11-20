import { HttpStatus } from "@nestjs/common";

import { KajHttpException } from "../../common/errors/kaj-http.exception";

function error(code: string, message: string, status: HttpStatus) {
  return new KajHttpException(
    {
      action: null,
      code,
      details: [],
      field: null,
      message,
      messageKey: `error.admin.${code.toLowerCase()}`,
      retryable: false,
    },
    status,
  );
}

export const staffNotFoundError = () =>
  error(
    "STAFF_NOT_FOUND",
    "No staff account with this id.",
    HttpStatus.NOT_FOUND,
  );
export const staffEmailInUseError = () =>
  error(
    "STAFF_EMAIL_IN_USE",
    "An account already uses this email address.",
    HttpStatus.CONFLICT,
  );
export const staffSelfChangeError = () =>
  error(
    "STAFF_SELF_CHANGE",
    "You cannot change your own role or access. Ask another administrator.",
    HttpStatus.CONFLICT,
  );
export const staffLastAdminError = () =>
  error(
    "STAFF_LAST_ADMIN",
    "This is the last active administrator. Add another one first.",
    HttpStatus.CONFLICT,
  );
export const staffStateError = (message: string) =>
  error("STAFF_STATE_CONFLICT", message, HttpStatus.CONFLICT);
