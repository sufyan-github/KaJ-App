import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import {
  LearnFeatures,
  SubscriptionFeature,
} from "../subscriptions/subscription-feature";
import {
  ApplyToLearningDto,
  CreateLearningOpportunityDto,
  LearningFeedQueryDto,
} from "./dto/learning.dto";
import { LearningService } from "./learning.service";

/** KAAJ Learn. Learn features are free (never SUBSCRIPTION_REQUIRED). */
@ApiTags("learning")
@Controller("learning-opportunities")
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get()
  @Policy(Policies.authenticated())
  feed(
    @CurrentUser() claims: AccessTokenClaims,
    @Query() query: LearningFeedQueryDto,
  ) {
    return this.learning.feed(claims.sub, query);
  }

  @Get("mine")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.learning.mine(claims.sub);
  }

  @Post()
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.authenticated())
  @SubscriptionFeature(LearnFeatures.learnPublishing)
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateLearningOpportunityDto,
  ) {
    return this.learning.create(claims.sub, body);
  }

  @Get(":id")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.learning.get(claims.sub, id);
  }

  @Post(":id/publish")
  @Roles(RoleMode.MENTOR)
  @Policy(Policies.mentorOwner())
  @SubscriptionFeature(LearnFeatures.learnPublishing)
  publish(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.learning.publish(claims.sub, id);
  }

  @Post(":id/applications")
  @Policy(Policies.authenticated())
  @SubscriptionFeature(LearnFeatures.learnApplication)
  apply(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ApplyToLearningDto,
  ) {
    return this.learning.apply(claims.sub, id, body);
  }
}
