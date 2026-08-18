import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";

import { ApiErrorDescriptor, ApiErrorEnvelope } from "../api/api-envelope";
import { KajHttpException } from "../errors/kaj-http.exception";
import { RateLimitException } from "../errors/rate-limit.exception";
import { RequestContextStorage } from "../context/request-context.storage";

const errorByStatus: Partial<Record<HttpStatus, ApiErrorDescriptor>> = {
  [HttpStatus.BAD_REQUEST]: {
    action: null,
    code: "BAD_REQUEST",
    details: [],
    field: null,
    message: "Invalid request.",
    messageKey: "error.common.bad_request",
    retryable: false,
  },
  [HttpStatus.UNAUTHORIZED]: {
    action: null,
    code: "UNAUTHORIZED",
    details: [],
    field: null,
    message: "Authentication is required.",
    messageKey: "error.auth.required",
    retryable: false,
  },
  [HttpStatus.FORBIDDEN]: {
    action: null,
    code: "FORBIDDEN",
    details: [],
    field: null,
    message: "You are not allowed to perform this action.",
    messageKey: "error.auth.forbidden",
    retryable: false,
  },
  [HttpStatus.NOT_FOUND]: {
    action: null,
    code: "NOT_FOUND",
    details: [],
    field: null,
    message: "Resource not found.",
    messageKey: "error.common.not_found",
    retryable: false,
  },
  [HttpStatus.CONFLICT]: {
    action: null,
    code: "CONFLICT",
    details: [],
    field: null,
    message: "The request conflicts with the current resource state.",
    messageKey: "error.common.conflict",
    retryable: false,
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    action: null,
    code: "BUSINESS_RULE_VIOLATION",
    details: [],
    field: null,
    message: "The request violates a business rule.",
    messageKey: "error.common.business_rule",
    retryable: false,
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    action: null,
    code: "RATE_LIMITED",
    details: [],
    field: null,
    message: "Too many requests. Try again later.",
    messageKey: "error.common.rate_limited",
    retryable: true,
  },
};

const internalError: ApiErrorDescriptor = {
  action: null,
  code: "INTERNAL_SERVER_ERROR",
  details: [],
  field: null,
  message: "An unexpected error occurred.",
  messageKey: "error.common.internal",
  retryable: true,
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly requestContext: RequestContextStorage) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const descriptor = this.getDescriptor(exception, status);
    const envelope: ApiErrorEnvelope = {
      error: {
        ...descriptor,
        requestId: this.requestContext.getRequestId(),
      },
    };

    if (exception instanceof RateLimitException) {
      response.setHeader("Retry-After", exception.retryAfterSeconds.toString());
    }

    response.status(status).json(envelope);
  }

  private getDescriptor(
    exception: unknown,
    status: number,
  ): ApiErrorDescriptor {
    if (exception instanceof KajHttpException) return exception.descriptor;
    return errorByStatus[status as HttpStatus] ?? internalError;
  }
}
