import { HttpStatus } from "@nestjs/common";

import { KajHttpException } from "../../common/errors/kaj-http.exception";

export interface OperatorCancelInstructions {
  shortCode: string;
  smsKeyword: string;
}

export function operatorSmsUnavailableError(): KajHttpException {
  return new KajHttpException(
    {
      action: null,
      code: "OPERATOR_SMS_UNAVAILABLE",
      details: [],
      field: null,
      message:
        "The verification code could not be sent by the mobile operator right now. Please try again shortly.",
      messageKey: "error.auth.operator_sms_unavailable",
      retryable: true,
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}

export function operatorUnsubscribeFailedError(
  instructions: OperatorCancelInstructions,
): KajHttpException {
  return new KajHttpException(
    {
      action: { type: "SEND_OPERATOR_STOP_SMS" },
      code: "OPERATOR_UNSUBSCRIBE_FAILED",
      details: [
        {
          shortCode: instructions.shortCode,
          smsKeyword: instructions.smsKeyword,
        },
      ],
      field: null,
      message: `The operator could not stop the subscription right now. Send "${instructions.smsKeyword}" to ${instructions.shortCode} or try again shortly.`,
      messageKey: "error.subscription.operator_unsubscribe_failed",
      retryable: true,
    },
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
