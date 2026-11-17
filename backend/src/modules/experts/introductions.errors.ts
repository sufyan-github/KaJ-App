import { ConflictException, NotFoundException } from "@nestjs/common";

import { RateLimitException } from "../../common/errors/rate-limit.exception";

/** Introduction errors (codes in docs/api/error-codes.md, bn + en). */
export const introductionErrors = {
  notFound: () =>
    new NotFoundException({
      code: "NOT_FOUND",
      message: "Not found.",
      messageKey: "error.not_found",
    }),
  alreadyPending: () =>
    new ConflictException({
      code: "INTRODUCTION_ALREADY_PENDING",
      message: "You already have a pending request to this expert.",
      messageKey: "error.introduction.already_pending",
    }),
  transition: (status: string, allowedActions: string[]) =>
    new ConflictException({
      code: "INTRODUCTION_TRANSITION_NOT_ALLOWED",
      message: `This request is ${status.toLowerCase()}.`,
      messageKey: "error.introduction.transition_not_allowed",
      details: [{ status, allowedActions }],
    }),
  ideaAccessOwnerOnly: () =>
    new ConflictException({
      code: "IDEA_ACCESS_OWNER_ONLY",
      message: "Only the idea's owner can offer access to its details.",
      messageKey: "error.introduction.idea_access_owner_only",
      field: "allowIdeaAccess",
    }),
  dailyLimit: (retryAfterSeconds: number) =>
    new RateLimitException(
      {
        action: null,
        code: "RATE_LIMITED",
        details: [],
        field: null,
        message: "You can send 5 introduction requests a day. Try again later.",
        messageKey: "error.introduction.daily_limit",
        retryable: true,
      },
      retryAfterSeconds,
    ),
};
