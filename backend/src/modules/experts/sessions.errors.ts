import { ConflictException, NotFoundException } from "@nestjs/common";

/** Session errors (codes in docs/api/error-codes.md, bn + en). */
export const sessionErrors = {
  notFound: () =>
    new NotFoundException({
      code: "NOT_FOUND",
      message: "Not found.",
      messageKey: "error.not_found",
    }),
  transition: (status: string) =>
    new ConflictException({
      code: "SESSION_TRANSITION_NOT_ALLOWED",
      message: `Not possible while the session is ${status.toLowerCase()}.`,
      messageKey: "error.session.transition_not_allowed",
      details: [{ status }],
    }),
  full: () =>
    new ConflictException({
      code: "SESSION_FULL",
      message: "Every place in this session is taken.",
      messageKey: "error.session.full",
    }),
  slotUnavailable: () =>
    new ConflictException({
      code: "SLOT_UNAVAILABLE",
      message: "The expert isn't available at that time.",
      messageKey: "error.jobs.slot_unavailable",
    }),
  consultationNotAccepted: () =>
    new ConflictException({
      code: "CONSULTATION_NOT_ACCEPTED",
      message: "The chat opens once the expert accepts the consultation.",
      messageKey: "error.session.consultation_not_accepted",
    }),
  womenOnly: () =>
    new ConflictException({
      code: "WOMEN_ONLY",
      message:
        "This is a women-only session. It is open to people whose profile says female.",
      messageKey: "error.session.women_only",
    }),
  invalid: (field: string, message: string) =>
    new ConflictException({
      code: "SESSION_DETAILS_INVALID",
      message,
      messageKey: "error.session.details_invalid",
      field,
    }),
  notStarted: () =>
    new ConflictException({
      code: "SESSION_NOT_STARTED",
      message: "Mark attendance or complete the session once it has started.",
      messageKey: "error.session.not_started",
    }),
};
