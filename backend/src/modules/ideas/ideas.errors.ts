import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

/** Ideas errors (codes in docs/api/error-codes.md, bn + en). */
export const ideaErrors = {
  /** The only answer anyone without a right to see an idea ever gets. */
  notFound: () =>
    new NotFoundException({
      code: "NOT_FOUND",
      message: "Idea not found.",
      messageKey: "error.not_found",
    }),
  identityRequired: () =>
    new ConflictException({
      code: "IDENTITY_REQUIRED",
      message:
        "Verify your identity (NID and selfie) before making an idea public.",
      messageKey: "error.idea.identity_required",
      field: "visibility",
    }),
  limitReached: () =>
    new ConflictException({
      code: "IDEA_LIMIT_REACHED",
      message: "You can have at most 20 ideas.",
      messageKey: "error.idea.limit_reached",
    }),
  confidentialityRequired: () =>
    new BadRequestException({
      code: "CONFIDENTIALITY_NOT_ACCEPTED",
      message: "Accept the confidentiality notice to ask for the details.",
      messageKey: "error.idea.confidentiality_required",
      field: "acceptConfidentiality",
    }),
  alreadyHasAccess: () =>
    new ConflictException({
      code: "IDEA_ACCESS_ALREADY_GRANTED",
      message: "You can already see this idea's details.",
      messageKey: "error.idea.access_already_granted",
    }),
  alreadyRequested: () =>
    new ConflictException({
      code: "IDEA_ACCESS_ALREADY_REQUESTED",
      message: "You already asked; the owner hasn't answered yet.",
      messageKey: "error.idea.access_already_requested",
    }),
  accessTransition: () =>
    new ConflictException({
      code: "IDEA_ACCESS_TRANSITION_NOT_ALLOWED",
      message: "That access request can't be changed this way.",
      messageKey: "error.idea.access_transition_not_allowed",
    }),
  roleLimit: () =>
    new ConflictException({
      code: "IDEA_ROLE_LIMIT_REACHED",
      message: "An idea can seek at most 10 roles.",
      messageKey: "error.idea.role_limit",
    }),
  roleNotOpen: () =>
    new ConflictException({
      code: "IDEA_ROLE_NOT_OPEN",
      message: "This role is no longer open.",
      messageKey: "error.idea.role_not_open",
    }),
  alreadyConverted: () =>
    new ConflictException({
      code: "IDEA_ALREADY_CONVERTED",
      message: "This idea is already a business.",
      messageKey: "error.idea.already_converted",
    }),
  notAgreed: () =>
    new ConflictException({
      code: "COLLABORATION_NOT_AGREED",
      message:
        "Add a team member from a collaboration request you both agreed (AGREED).",
      messageKey: "error.idea.collaboration_not_agreed",
      field: "collaborationRequestId",
    }),
  alreadyMember: () =>
    new ConflictException({
      code: "ALREADY_MEMBER",
      message: "This person is already on the team.",
      messageKey: "error.business.already_member",
    }),
  ownStage: () =>
    new BadRequestException({
      code: "VALIDATION_FAILED",
      message: "Convert the idea to a business to mark it CONVERTED.",
      messageKey: "error.validation.failed",
      field: "stage",
    }),
};
