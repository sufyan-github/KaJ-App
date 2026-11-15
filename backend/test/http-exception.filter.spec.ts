import {
  ArgumentsHost,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { RequestContextStorage } from "../src/common/context/request-context.storage";
import { RequestValidationException } from "../src/common/errors/validation.exception";
import { HttpExceptionFilter } from "../src/common/filters/http-exception.filter";

function capture(exception: unknown) {
  const filter = new HttpExceptionFilter(new RequestContextStorage());
  const result: { status?: number; body?: { error: Record<string, unknown> } } =
    {};
  const response = {
    setHeader: jest.fn(),
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: { error: Record<string, unknown> }) {
      result.body = body;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: "GET", originalUrl: "/api/v1/x?phone=1" }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return { status: result.status!, error: result.body!.error };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("database detail", {
    clientVersion: "test",
    code,
  });
}

describe("HttpExceptionFilter", () => {
  beforeEach(() => jest.spyOn(Logger.prototype, "error").mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it("keeps Kaj descriptors unchanged", () => {
    const { status, error } = capture(new RequestValidationException([]));
    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(error).toMatchObject({
      code: "VALIDATION_FAILED",
      messageKey: "error.validation.failed",
    });
  });

  it("carries the thrown message for plain Nest exceptions and keeps the status-level code", () => {
    const { status, error } = capture(
      new ConflictException("Only confirmed work can be submitted."),
    );
    expect(status).toBe(HttpStatus.CONFLICT);
    expect(error).toMatchObject({
      code: "CONFLICT",
      message: "Only confirmed work can be submitted.",
      messageKey: "error.common.conflict",
      retryable: false,
    });
  });

  it("preserves an explicit code, messageKey and field (subscription gate)", () => {
    const { status, error } = capture(
      new ForbiddenException({
        code: "SUBSCRIPTION_REQUIRED",
        field: "subscription",
        message: "Your subscription is inactive.",
        messageKey: "error.subscription.required",
      }),
    );
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(error).toMatchObject({
      code: "SUBSCRIPTION_REQUIRED",
      field: "subscription",
      message: "Your subscription is inactive.",
      messageKey: "error.subscription.required",
    });
  });

  it("ignores malformed codes and keys", () => {
    const { error } = capture(
      new UnprocessableEntityException({
        code: "lower case",
        message: "Rule broken.",
        messageKey: "Not A Key",
      }),
    );
    expect(error).toMatchObject({
      code: "BUSINESS_RULE_VIOLATION",
      message: "Rule broken.",
      messageKey: "error.common.business_rule",
    });
  });

  it("keeps the generic message for framework route-not-found errors", () => {
    const { error } = capture(new NotFoundException("Cannot GET /api/v1/x"));
    expect(error).toMatchObject({ message: "Resource not found." });
  });

  it("uses the generic message when none is supplied", () => {
    const { error } = capture(new NotFoundException());
    expect(error).toMatchObject({
      code: "NOT_FOUND",
      message: "Resource not found.",
      messageKey: "error.common.not_found",
    });
    expect(capture(new ForbiddenException()).error).toMatchObject({
      code: "FORBIDDEN",
      message: "You are not allowed to perform this action.",
    });
  });

  it("keeps a moderation denial's code, message and key", () => {
    const { status, error } = capture(
      new ForbiddenException({
        code: "ACCOUNT_RESTRICTED",
        message: "Marketplace actions are temporarily restricted.",
        messageKey: "error.account.restricted",
      }),
    );
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(error).toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      message: "Marketplace actions are temporarily restricted.",
      messageKey: "error.account.restricted",
      retryable: false,
    });
  });

  it("maps 503 to a retryable SERVICE_UNAVAILABLE, not an internal error", () => {
    const { status, error } = capture(new ServiceUnavailableException());
    expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      messageKey: "error.common.service_unavailable",
      retryable: true,
    });
  });

  it("maps 413 to PAYLOAD_TOO_LARGE", () => {
    expect(capture(new PayloadTooLargeException()).error).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it.each([
    ["P2025", HttpStatus.NOT_FOUND, "NOT_FOUND", false],
    ["P2002", HttpStatus.CONFLICT, "ALREADY_EXISTS", false],
    ["P2003", HttpStatus.UNPROCESSABLE_ENTITY, "INVALID_REFERENCE", false],
    ["P2034", HttpStatus.CONFLICT, "CONCURRENT_UPDATE", true],
  ])("maps Prisma %s to %i %s", (code, status, apiCode, retryable) => {
    const result = capture(prismaError(code));
    expect(result.status).toBe(status);
    expect(result.error).toMatchObject({ code: apiCode, retryable });
    expect(JSON.stringify(result.error)).not.toContain("database detail");
    expect(Logger.prototype.error).not.toHaveBeenCalled();
  });

  it("returns a generic 500 and logs the error without leaking it", () => {
    const { status, error } = capture(new Error("secret internal detail"));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(JSON.stringify(error)).not.toContain("secret internal detail");
    expect(Logger.prototype.error).toHaveBeenCalledTimes(1);
  });

  it("logs client errors once, at info level, without the query string", () => {
    const info = jest.spyOn(Logger.prototype, "log").mockImplementation();
    capture(new ConflictException("conflict"));
    expect(Logger.prototype.error).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]![0]).toMatchObject({
      code: "CONFLICT",
      method: "GET",
      path: "/api/v1/x",
      statusCode: 409,
    });
    expect(JSON.stringify(info.mock.calls[0])).not.toContain("phone");
  });
});
