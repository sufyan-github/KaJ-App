import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
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
import { AdminDirectoryService } from "./admin-directory.service";
import {
  AttendanceListQueryDto,
  ContentListQueryDto,
  IntroductionListQueryDto,
  MentorListQueryDto,
} from "./dto/admin-directory.dto";

/**
 * Read-only lists (R5). Roles follow who may act on what is listed:
 * businesses and mentors as their verification queues, ideas and
 * introductions as content moderation (ADMIN, MODERATOR), attendance as the
 * check-in/check-out overrides.
 */
@Controller("admin")
@UseGuards(AdminSessionGuard)
export class AdminDirectoryController {
  constructor(private readonly directory: AdminDirectoryService) {}

  @Get("businesses")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  businesses(
    @Query() query: ContentListQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.directory.businesses(query, actor, context(request));
  }

  @Get("ideas")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  ideas(
    @Query() query: ContentListQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.directory.ideas(query, actor, context(request));
  }

  @Get("introductions")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR)
  introductions(
    @Query() query: IntroductionListQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.directory.introductions(query, actor, context(request));
  }

  @Get("mentors")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  mentors(
    @Query() query: MentorListQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.directory.mentors(query, actor, context(request));
  }

  @Get("attendance")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  attendance(
    @Query() query: AttendanceListQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.directory.attendance(query, actor, context(request));
  }
}

function context(request: Request): AdminRequestContext {
  return {
    ip: request.ip || request.socket.remoteAddress || null,
    ua: request.headers["user-agent"] ?? null,
  };
}
