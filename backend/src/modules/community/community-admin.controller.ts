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
import { AdminActor } from "../admin-auth/admin-auth.types";
import { context } from "../learning/learning-admin.controller";
import { CommunityAdminService } from "./community-admin.service";
import {
  AdminGroupQueryDto,
  AdminGroupRoleDto,
  AdminSessionQueryDto,
} from "./dto/community-admin.dto";

/** Admin console routes for KAAJ Community and sessions (admin session + TOTP). */
@Controller("admin")
@UseGuards(AdminSessionGuard)
export class CommunityAdminController {
  constructor(private readonly admin: CommunityAdminService) {}

  @Get("community/groups")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  groups(
    @Query() query: AdminGroupQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.groupList(query, actor, context(request));
  }

  @Get("sessions")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  sessions(
    @Query() query: AdminSessionQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.sessionList(query, actor, context(request));
  }

  @Get("community/ambassadors")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  ambassadors(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.admin.ambassadors(actor, context(request));
  }

  @Post("community/groups/:id/members/:userId/role")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  setRole(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: AdminGroupRoleDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.admin.setRole(id, userId, body, actor, context(request));
  }
}
