import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
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

// Prisma errors that describe a client problem rather than a server fault.
const prismaErrors: Record<
  string,
  { status: HttpStatus; descriptor: ApiErrorDescriptor }
> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    descriptor: {
      ...errorByStatus[HttpStatus.CONFLICT]!,
      code: "ALREADY_EXISTS",
      message: "A matching record already exists.",
      messageKey: "error.common.already_exists",
    },
  },
  P2003: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    descriptor: {
      ...errorByStatus[HttpStatus.UNPROCESSABLE_ENTITY]!,
      code: "INVALID_REFERENCE",
      message: "A referenced record does not exist.",
      messageKey: "error.common.invalid_reference",
    },
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    descriptor: errorByStatus[HttpStatus.NOT_FOUND]!,
  },
  P2034: {
    status: HttpStatus.CONFLICT,
    descriptor: {
      ...errorByStatus[HttpStatus.CONFLICT]!,
      code: "CONCURRENT_UPDATE",
      message: "The resource changed at the same time. Try again.",
      messageKey: "error.common.concurrent_update",
      retryable: true,
    },
  },
};

const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
// Nest's router reports unmatched routes as "Cannot GET /path"; the API
// contract keeps its generic not-found message for those.
const FRAMEWORK_ROUTE_MESSAGE = /^Cannot [A-Z]+ \//;
const MESSAGE_KEY_PATTERN = /^[a-z][a-z0-9_.]{1,127}$/;

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly requestContext: RequestContextStorage) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const { status, descriptor } = this.resolve(exception);
    const requestId = this.requestContext.getRequestId();
    const envelope: ApiErrorEnvelope = {
      error: { ...descriptor, requestId },
    };

    if (status >= 500) {
      const error =
        exception instanceof Error
          ? exception
          : new Error("Non-Error value thrown");
      // Only the error itself is logged; request bodies and headers are not.
      this.logger.error(
        { err: { name: error.name, message: error.message }, requestId },
        error.stack,
      );
    }

    if (exception instanceof RateLimitException) {
      response.setHeader("Retry-After", exception.retryAfterSeconds.toString());
    }

    response.status(status).json(envelope);
  }

  private resolve(exception: unknown): {
    status: number;
    descriptor: ApiErrorDescriptor;
  } {
    if (exception instanceof KajHttpException)
      return {
        status: exception.getStatus(),
        descriptor: exception.descriptor,
      };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const base = errorByStatus[status as HttpStatus] ?? {
        ...internalError,
        retryable: status >= 500,
      };
      return {
        status,
        descriptor: withThrownDetails(base, exception.getResponse()),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = prismaErrors[exception.code];
      if (mapped) return mapped;
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      descriptor: internalError,
    };
  }
}

/**
 * Keeps the generic per-status descriptor (so clients that branch on the
 * status-level code still work) but carries over the message, and any
 * explicit code/messageKey/field, that the throwing code supplied.
 */
function withThrownDetails(
  base: ApiErrorDescriptor,
  thrown: string | object,
): ApiErrorDescriptor {
  const usable = (value: unknown): value is string =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    !FRAMEWORK_ROUTE_MESSAGE.test(value);

  if (typeof thrown === "string")
    return usable(thrown) ? { ...base, message: thrown } : base;

  const body = thrown as Record<string, unknown>;
  const message = Array.isArray(body.message) ? body.message[0] : body.message;
  return {
    ...base,
    ...(usable(message) ? { message } : {}),
    ...(typeof body.code === "string" && CODE_PATTERN.test(body.code)
      ? { code: body.code }
      : {}),
    ...(typeof body.messageKey === "string" &&
    MESSAGE_KEY_PATTERN.test(body.messageKey)
      ? { messageKey: body.messageKey }
      : {}),
    ...(typeof body.field === "string" ? { field: body.field } : {}),
    ...(Array.isArray(body.details) ? { details: body.details } : {}),
    ...(typeof body.retryable === "boolean"
      ? { retryable: body.retryable }
      : {}),
  };
}
