import { ConflictException, ForbiddenException } from "@nestjs/common";

/** Mentor capability errors (codes in docs/api/error-codes.md, bn + en). */
export const mentorErrors = {
  approvalRequired: () =>
    new ForbiddenException({
      code: "MENTOR_APPROVAL_REQUIRED",
      message:
        "Only approved mentors can do this. Apply to become a mentor first.",
      messageKey: "error.mentor.approval_required",
    }),
  suspended: () =>
    new ForbiddenException({
      code: "MENTOR_SUSPENDED",
      message: "Your mentor profile is suspended.",
      messageKey: "error.mentor.suspended",
    }),
  identityRequired: () =>
    new ConflictException({
      code: "IDENTITY_REQUIRED",
      message:
        "Verify your identity (NID and selfie) before applying to mentor.",
      messageKey: "error.mentor.identity_required",
    }),
  pending: () =>
    new ConflictException({
      code: "MENTOR_APPLICATION_PENDING",
      message: "Your mentor application is being reviewed.",
      messageKey: "error.mentor.application_pending",
    }),
  alreadyApproved: () =>
    new ConflictException({
      code: "MENTOR_ALREADY_APPROVED",
      message: "You are already an approved mentor.",
      messageKey: "error.mentor.already_approved",
    }),
};
