import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AdminRole } from "@prisma/client";
import { Request } from "express";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AdminRoles, CurrentAdmin } from "../admin-auth/admin-auth.decorators";
import { AdminSessionGuard } from "../admin-auth/admin-session.guard";
import { AdminActor } from "../admin-auth/admin-auth.types";
import { AiUsageAdminService } from "./ai-usage-admin.service";
import { AiUsageQueryDto } from "./dto/ai-admin.dto";

/** P4 cost oversight for the admin console. ADMIN only. */
@Controller("admin/ai")
@UseGuards(AdminSessionGuard)
export class AiUsageAdminController {
  constructor(private readonly usage: AiUsageAdminService) {}

  @Get("usage")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  list(
    @Query() query: AiUsageQueryDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.usage.usage(query.days, actor, {
      ip: request.ip || request.socket.remoteAddress || null,
      ua: request.headers["user-agent"] ?? null,
    });
  }
}
