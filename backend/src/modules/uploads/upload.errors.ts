import { HttpStatus } from "@nestjs/common";

import { KajHttpException } from "../../common/errors/kaj-http.exception";

export function uploadError(
  code: string,
  messageKey: string,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
): KajHttpException {
  return new KajHttpException(
    {
      action: null,
      code,
      details: [],
      field: null,
      message,
      messageKey,
      retryable: false,
    },
    status,
  );
}
