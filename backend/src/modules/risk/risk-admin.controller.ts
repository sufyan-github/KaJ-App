import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
  RiskDecisionDto,
  RiskQueueQueryDto,
  RiskScanDto,
} from "./dto/risk.dto";
import { RiskService } from "./risk.service";

@Controller("admin/risk")
@UseGuards(AdminSessionGuard)
export class RiskAdminController {
  constructor(private readonly risk: RiskService) {}

  @Get("items")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  items(
    @Query() query: RiskQueueQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.risk.queue(query, actor, this.context(request));
  }

  @Post("scan")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  scan(
    @Body() body: RiskScanDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.risk.scan(body.reason, actor, this.context(request));
  }

  @Post("items/:id/review")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  review(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.risk.startReview(id, actor, this.context(request));
  }

  @Post("items/:id/decision")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  decide(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: RiskDecisionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.risk.decide(id, body, actor, this.context(request));
  }

  private context(request: Request): AdminRequestContext {
    return {
      ip: request.ip || request.socket.remoteAddress || null,
      ua: request.get("user-agent") ?? null,
    };
  }
}
