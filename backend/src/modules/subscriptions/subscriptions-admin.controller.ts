import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import { Request } from "express";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AdminRoles, CurrentAdmin } from "../admin-auth/admin-auth.decorators";
import { AdminSessionGuard } from "../admin-auth/admin-session.guard";
import {
  AdminActor,
  AdminRequestContext,
} from "../admin-auth/admin-auth.types";
import {
  CreateSubscriptionPlanDto,
  SubscriptionQueryDto,
  UpdateAccessRuleDto,
  UpdateSubscriptionDto,
  UpdateSubscriptionPlanDto,
} from "./dto/subscriptions.dto";
import { SubscriptionsService } from "./subscriptions.service";

const SUBSCRIPTION_ROLES = [AdminRole.ADMIN, AdminRole.FINANCE];

@Controller("admin/subscriptions")
@UseGuards(AdminSessionGuard)
export class SubscriptionsAdminController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get("overview")
  @Policy(Policies.public())
  @AdminRoles(...SUBSCRIPTION_ROLES)
  overview() {
    return this.subscriptions.adminOverview();
  }

  @Get()
  @Policy(Policies.public())
  @AdminRoles(...SUBSCRIPTION_ROLES)
  list(@Query() query: SubscriptionQueryDto) {
    return this.subscriptions.adminList(query);
  }

  @Post("plans")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  createPlan(
    @Body() body: CreateSubscriptionPlanDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.subscriptions.createPlan(body, actor, context(request));
  }

  @Put("plans/:id")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  updatePlan(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateSubscriptionPlanDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.subscriptions.updatePlan(id, body, actor, context(request));
  }

  @Put(":id/status")
  @Policy(Policies.public())
  @AdminRoles(...SUBSCRIPTION_ROLES)
  updateSubscription(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: UpdateSubscriptionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.subscriptions.updateSubscription(
      id,
      body,
      actor,
      context(request),
    );
  }

  @Put("access-rules/:featureKey")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  updateAccessRule(
    @Param("featureKey") featureKey: string,
    @Body() body: UpdateAccessRuleDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.subscriptions.updateAccessRule(
      featureKey,
      body,
      actor,
      context(request),
    );
  }
}

function context(request: Request): AdminRequestContext {
  return {
    ip: request.ip || request.socket.remoteAddress || null,
    ua: request.headers["user-agent"] ?? null,
  };
}
