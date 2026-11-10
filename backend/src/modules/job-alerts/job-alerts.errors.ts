import { HttpStatus } from "@nestjs/common";

import { KajHttpException } from "../../common/errors/kaj-http.exception";
import { MAX_JOB_ALERTS } from "./job-alert.rules";

export function jobAlertLimitError(): KajHttpException {
  return new KajHttpException(
    {
      action: null,
      code: "JOB_ALERT_LIMIT",
      details: [{ limit: MAX_JOB_ALERTS }],
      field: null,
      message: `You can keep at most ${MAX_JOB_ALERTS} job alerts.`,
      messageKey: "error.job_alert.limit",
      retryable: false,
    },
    HttpStatus.CONFLICT,
  );
}

export function jobAlertDuplicateError(): KajHttpException {
  return new KajHttpException(
    {
      action: null,
      code: "JOB_ALERT_DUPLICATE",
      details: [],
      field: null,
      message: "You already have an alert for these filters.",
      messageKey: "error.job_alert.duplicate",
      retryable: false,
    },
    HttpStatus.CONFLICT,
  );
}

export function jobAlertFilterUnavailableError(
  field: string,
): KajHttpException {
  return new KajHttpException(
    {
      action: null,
      code: "JOB_ALERT_FILTER_UNAVAILABLE",
      details: [],
      field,
      message: "A chosen category, skill or area is not available.",
      messageKey: "error.job_alert.filter_unavailable",
      retryable: false,
    },
    HttpStatus.BAD_REQUEST,
  );
}
