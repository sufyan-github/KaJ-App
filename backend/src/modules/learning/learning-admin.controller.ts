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
  AdminReasonDto,
} from "./dto/learning-admin.dto";
import { LearningAdminService } from "./learning-admin.service";

/** Admin console routes for KAAJ Learn (admin session + TOTP). */
@Controller("admin")
@UseGuards(AdminSessionGuard)
export class LearningAdminController {
  constructor(private readonly admin: LearningAdminService) {}

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
