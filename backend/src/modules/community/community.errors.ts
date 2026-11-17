import { ConflictException, NotFoundException } from "@nestjs/common";

/** Community errors (codes in docs/api/error-codes.md, bn + en). */
export const communityErrors = {
  notFound: () =>
    new NotFoundException({
      code: "NOT_FOUND",
      message: "Not found.",
      messageKey: "error.not_found",
    }),
  identityRequired: () =>
    new ConflictException({
      code: "IDENTITY_REQUIRED",
      message: "Verify your identity (NID and selfie) before starting a group.",
      messageKey: "error.community.identity_required",
    }),
  limit: () =>
    new ConflictException({
      code: "GROUP_LIMIT_REACHED",
      message: "You can start at most 5 groups.",
      messageKey: "error.community.group_limit",
    }),
  womenOnly: () =>
    new ConflictException({
      code: "WOMEN_ONLY",
      message: "This is a women-only group (open to profiles marked female).",
      messageKey: "error.community.women_only",
    }),
  removed: () =>
    new ConflictException({
      code: "REMOVED_FROM_GROUP",
      message: "A moderator removed you from this group.",
      messageKey: "error.community.removed",
    }),
  alreadyMember: () =>
    new ConflictException({
      code: "ALREADY_MEMBER",
      message: "You are already a member or your request is pending.",
      messageKey: "error.business.already_member",
    }),
  lastModerator: () =>
    new ConflictException({
      code: "LAST_MODERATOR",
      message: "A group needs at least one moderator. Add another first.",
      messageKey: "error.community.last_moderator",
    }),
  transition: () =>
    new ConflictException({
      code: "GROUP_MEMBERSHIP_TRANSITION_NOT_ALLOWED",
      message: "That isn't possible for this membership now.",
      messageKey: "error.community.transition_not_allowed",
    }),
};
