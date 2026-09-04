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
  DirectModerationDto,
  ModerationDecisionDto,
  ModerationReasonDto,
  ReportQueueQueryDto,
} from "./dto/moderation.dto";
import { ModerationService } from "./moderation.service";

@Controller("admin")
@UseGuards(AdminSessionGuard)
export class ModerationAdminController {
  constructor(private readonly moderation: ModerationService) {}

  @Get("reports")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  reports(
    @Query() query: ReportQueueQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.moderation.queue(query, actor, this.context(request));
  }

  @Post("reports/:id/review")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  review(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.moderation.startReview(id, actor, this.context(request));
  }

  @Post("reports/:id/decision")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  decide(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ModerationDecisionDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.moderation.decide(id, body, actor, this.context(request));
  }

  @Post("users/:id/moderation")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  moderate(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: DirectModerationDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.moderation.moderateUser(id, body, actor, this.context(request));
  }

  @Post("users/:id/moderation/restore")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  restore(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ModerationReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.moderation.restoreUser(
      id,
      body.reason,
      actor,
      this.context(request),
    );
  }

  @Post("moderation-actions/:id/post-incident-review")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  postIncidentReview(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: ModerationReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.moderation.completePostIncidentReview(
      id,
      body.reason,
      actor,
      this.context(request),
    );
  }

  private context(request: Request): AdminRequestContext {
    return {
      ip: request.ip ?? null,
      ua: request.get("user-agent") ?? null,
    };
  }
}
