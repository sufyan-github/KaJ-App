import { HttpStatus } from "@nestjs/common";

import { KajHttpException } from "../../common/errors/kaj-http.exception";

export function operatorCancellationRequiredError(): KajHttpException {
  return new KajHttpException(
    {
      action: { type: "FOLLOW_OPERATOR_UNSUBSCRIBE_INSTRUCTIONS" },
      code: "OPERATOR_CANCELLATION_REQUIRED",
      details: [],
      field: null,
      message:
        "Carrier billing cannot be stopped inside KAAJ. Follow the unsubscribe instructions in your operator confirmation SMS, then refresh this page.",
      messageKey: "error.subscription.operator_cancellation_required",
      retryable: false,
    },
    HttpStatus.CONFLICT,
  );
}
