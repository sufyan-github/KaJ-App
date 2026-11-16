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
  AdminCertificateQueryDto,
  AdminOpportunityQueryDto,
  AdminReasonDto,
} from "./dto/learning-admin.dto";
import { LearningAdminService } from "./learning-admin.service";

/** Admin console routes for KAAJ Learn (admin session + TOTP). */
@Controller("admin")
@UseGuards(AdminSessionGuard)
export class LearningAdminController {
  constructor(private readonly admin: LearningAdminService) {}

  @Get("learning-opportunities")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  opportunities(@Query() query: AdminOpportunityQueryDto) {
    return this.admin.opportunities(query);
  }

  @Post("learning-opportunities/:id/suspend")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  suspendOpportunity(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AdminReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.suspendOpportunity(id, body, actor, context(request));
  }

  @Post("learning-opportunities/:id/restore")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  restoreOpportunity(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AdminReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.restoreOpportunity(id, body, actor, context(request));
  }

  @Post("mentors/:userId/suspend")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  suspendMentor(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: AdminReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.setMentorSuspended(
      userId,
      true,
      body,
      actor,
      context(request),
    );
  }

  @Post("mentors/:userId/reinstate")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  reinstateMentor(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: AdminReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.setMentorSuspended(
      userId,
      false,
      body,
      actor,
      context(request),
    );
  }

  @Get("users/:userId/learning")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  userLearning(@Param("userId", new ParseUUIDPipe()) userId: string) {
    return this.admin.userLearning(userId);
  }

  @Get("certificates")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  certificates(@Query() query: AdminCertificateQueryDto) {
    return this.admin.certificates(query);
  }

  @Post("certificates/:id/revoke")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  revoke(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() body: AdminReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.revokeCertificate(id, body, actor, context(request));
  }
}

export function context(request: Request): AdminRequestContext {
  return {
    ip: request.ip || request.socket.remoteAddress || null,
    ua: request.headers["user-agent"] ?? null,
  };
}
