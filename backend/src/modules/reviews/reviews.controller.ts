import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { ReviewsService } from "./reviews.service";

@ApiTags("reviews")
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post("assignments/:id/reviews")
  @Policy(Policies.authenticated())
  create(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) assignmentId: string,
    @Body() body: CreateReviewDto,
  ) {
    return this.reviews.create(claims.sub, assignmentId, body);
  }

  @Get("assignments/:id/reviews")
  @Policy(Policies.authenticated())
  assignmentReviews(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) assignmentId: string,
  ) {
    return this.reviews.forAssignment(claims.sub, assignmentId);
  }

  @Get("reviews/received")
  @Policy(Policies.authenticated())
  received(@CurrentUser() claims: AccessTokenClaims) {
    return this.reviews.received(claims.sub);
  }

  @Get("me/reputation")
  @Policy(Policies.authenticated())
  reputation(@CurrentUser() claims: AccessTokenClaims) {
    return this.reviews.reputation(claims.sub);
  }
}
