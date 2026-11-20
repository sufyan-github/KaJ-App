import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { RateLimitException } from "../../common/errors/rate-limit.exception";
import { AUTH_RATE_LIMITER, AuthRateLimiter } from "../auth/auth-rate-limiter";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { AvailabilityService } from "./availability.service";
import {
  CreateAvailabilityExceptionDto,
  AvailabilitySlotsQueryDto,
  ReplaceAvailabilityDto,
} from "./dto/availability.dto";

@ApiTags("availability")
@Controller("profiles/me/availability")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  /**
   * W5: workers, and approved mentors (who may not be workers), keep their
   * own availability so they can offer consultation times.
   */
  private async assertMayKeepAvailability(claims: AccessTokenClaims) {
    if (claims.roles.includes(RoleMode.WORKER)) return;
    await this.availability.assertApprovedMentor(claims.sub);
  }

  @Get()
  @Roles(RoleMode.WORKER, RoleMode.MENTOR)
  @Policy(Policies.authenticated())
  async getAvailability(@CurrentUser() claims: AccessTokenClaims) {
    await this.assertMayKeepAvailability(claims);
    return this.availability.getAvailability(claims.sub);
  }

  @Put()
  @Roles(RoleMode.WORKER, RoleMode.MENTOR)
  @Policy(Policies.authenticated())
  async replaceRules(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: ReplaceAvailabilityDto,
  ) {
    await this.assertMayKeepAvailability(claims);
    return this.availability.replaceRules(claims.sub, body.rules);
  }

  @Post("exceptions")
  @Roles(RoleMode.WORKER, RoleMode.MENTOR)
  @Policy(Policies.authenticated())
  async createException(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateAvailabilityExceptionDto,
  ) {
    await this.assertMayKeepAvailability(claims);
    return this.availability.createException(claims.sub, body);
  }

  @Delete("exceptions/:id")
  @Roles(RoleMode.WORKER, RoleMode.MENTOR)
  @Policy(Policies.authenticated())
  async deleteException(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    await this.assertMayKeepAvailability(claims);
    return this.availability.deleteException(claims.sub, id);
  }
}

// Enough for comparing a few workers while booking; not for sweeping
// through everyone's schedule.
const SLOT_LOOKUPS_PER_VIEWER = 60;
const SLOT_LOOKUP_WINDOW_SECONDS = 60 * 60;

@ApiTags("availability")
@Controller("workers/:workerId/availability")
export class PublicAvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    @Inject(AUTH_RATE_LIMITER) private readonly rateLimiter: AuthRateLimiter,
  ) {}

  /**
   * A worker's free slots, for booking them: only people who can hire
   * (customer or business), for upcoming dates, not across a block, not for
   * a hidden worker they have no dealings with, and rate limited per viewer.
   */
  @Get("slots")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  async getSlots(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("workerId", new ParseUUIDPipe()) workerId: string,
    @Query() query: AvailabilitySlotsQueryDto,
  ) {
    const limit = await this.rateLimiter.consume({
      key: claims.sub,
      limit: SLOT_LOOKUPS_PER_VIEWER,
      scope: "slots-viewer",
      windowSeconds: SLOT_LOOKUP_WINDOW_SECONDS,
    });
    if (!limit.allowed)
      throw new RateLimitException(
        {
          action: null,
          code: "RATE_LIMITED",
          details: [],
          field: null,
          message: "Too many requests. Try again later.",
          messageKey: "error.common.rate_limited",
          retryable: true,
        },
        limit.retryAfterSeconds,
      );
    return this.availability.getPublicSlots(
      workerId,
      query.from,
      query.to,
      claims.sub,
    );
  }
}
