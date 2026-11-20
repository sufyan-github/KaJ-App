import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

/** Business errors (codes in docs/api/error-codes.md, bn + en). */
export const businessErrors = {
  notFound: () =>
    new NotFoundException({
      code: "NOT_FOUND",
      message: "Business not found.",
      messageKey: "error.not_found",
    }),
  incomplete: (field: string) =>
    new ConflictException({
      code: "BUSINESS_PROFILE_INCOMPLETE",
      message: "Add a sector and an area before making the business public.",
      messageKey: "error.business.profile_incomplete",
      field,
    }),
  suspended: () =>
    new ConflictException({
      code: "BUSINESS_SUSPENDED",
      message: "This business is suspended by KAAJ moderation.",
      messageKey: "error.business.suspended",
    }),
  limitReached: () =>
    new ConflictException({
      code: "BUSINESS_LIMIT_REACHED",
      message: "You can own at most 5 businesses.",
      messageKey: "error.business.limit_reached",
    }),
  alreadyMember: () =>
    new ConflictException({
      code: "ALREADY_MEMBER",
      message: "This person is already a member or invited.",
      messageKey: "error.business.already_member",
    }),
  lastOwner: () =>
    new ConflictException({
      code: "LAST_OWNER",
      message: "A business needs at least one owner. Add another owner first.",
      messageKey: "error.business.last_owner",
    }),
  memberLimit: () =>
    new ConflictException({
      code: "MEMBER_LIMIT_REACHED",
      message: "A business can have at most 50 members.",
      messageKey: "error.business.member_limit",
    }),
  ownerOnly: () =>
    new ForbiddenException({
      code: "BUSINESS_OWNER_REQUIRED",
      message: "Only an owner can do this.",
      messageKey: "error.business.owner_required",
    }),
  offeringTitleRequired: () =>
    new BadRequestException({
      code: "OFFERING_TITLE_REQUIRED",
      message: "Give the offering a title in Bangla or English.",
      messageKey: "error.business.offering_title_required",
      field: "titleBn",
    }),
  offeringPriceInvalid: () =>
    new BadRequestException({
      code: "OFFERING_PRICE_INVALID",
      message: "The lowest price can't be more than the highest.",
      messageKey: "error.business.offering_price_invalid",
      field: "priceMinPoisha",
    }),
  offeringLimit: () =>
    new ConflictException({
      code: "OFFERING_LIMIT_REACHED",
      message: "A business can list at most 100 offerings.",
      messageKey: "error.business.offering_limit",
    }),
  // W15: `field` names what is missing: the stage, or the licence number.
  notRegistered: (field: "stage" | "tradeLicenceNo" = "stage") =>
    new ConflictException({
      code: "BUSINESS_NOT_REGISTERED",
      message:
        field === "stage"
          ? "Only a registered business with a trade licence number can be verified."
          : "Add the trade licence number before asking for verification.",
      messageKey: "error.business.not_registered",
      field,
    }),
  alreadyVerified: () =>
    new ConflictException({
      code: "BUSINESS_ALREADY_VERIFIED",
      message: "This business is already verified.",
      messageKey: "error.business.already_verified",
    }),
};
