import { HttpStatus } from "@nestjs/common";
import { KajHttpException } from "../../common/errors/kaj-http.exception";

export function passwordError(
  code: string,
  message: string,
  status = HttpStatus.BAD_REQUEST,
) {
  return new KajHttpException(
    {
      action: null,
      code,
      details: [],
      field: null,
      message,
      messageKey: `error.auth.${code.toLowerCase()}`,
      retryable: false,
    },
    status,
  );
}
