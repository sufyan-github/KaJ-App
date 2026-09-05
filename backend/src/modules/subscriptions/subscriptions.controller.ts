import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { RequestSubscriptionDto } from "./dto/subscriptions.dto";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get("me")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.subscriptions.mine(claims.sub);
  }

  @Get("history")
  @Policy(Policies.authenticated())
  history(@CurrentUser() claims: AccessTokenClaims) {
    return this.subscriptions.history(claims.sub);
  }

  @Post("request")
  @Policy(Policies.authenticated())
  request(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: RequestSubscriptionDto,
  ) {
    return this.subscriptions.request(claims.sub, body);
  }

  @Post("cancel")
  @Policy(Policies.authenticated())
  cancel(@CurrentUser() claims: AccessTokenClaims) {
    return this.subscriptions.cancel(claims.sub);
  }
}
