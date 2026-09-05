import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  RawBodyRequest,
  Req,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { BdappsWebhookVerifier } from "../../infra/bdapps/bdapps-webhook.verifier";
import { RequestSubscriptionDto } from "./dto/subscriptions.dto";
import { SubscriptionsService } from "./subscriptions.service";

@ApiTags("subscriptions")
@Controller("subscriptions")
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly bdappsWebhook: BdappsWebhookVerifier,
  ) {}

  @Post("bdapps/webhook")
  @Policy(Policies.public())
  async handleBdappsWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Body() body: Record<string, unknown>,
  ) {
    await this.bdappsWebhook.verify(request.headers, request.rawBody);
    const subscriberId = body.subscriberId;
    const status = body.status;
    const providerEventId = body.providerEventId;
    if (
      typeof subscriberId !== "string" ||
      (status !== "REGISTERED" && status !== "UNSUBSCRIBED") ||
      (providerEventId !== null &&
        providerEventId !== undefined &&
        typeof providerEventId !== "string")
    ) {
      throw new BadRequestException("Invalid verified webhook payload.");
    }
    return this.subscriptions.applyBdappsWebhook({
      providerEventId:
        typeof providerEventId === "string" ? providerEventId : null,
      status,
      subscriberId,
    });
  }

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
