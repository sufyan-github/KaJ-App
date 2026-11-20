import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { ReasonDto } from "../admin-ops/dto/admin-ops.dto";
import { AdminStaffService } from "./admin-staff.service";
import { StaffInviteDto, StaffRoleDto } from "./dto/admin-staff.dto";

/** Staff accounts. ADMIN only, on every route. */
@Controller("admin/staff")
@UseGuards(AdminSessionGuard)
export class AdminStaffController {
  constructor(private readonly staff: AdminStaffService) {}

  @Get()
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  list(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.staff.list(actor, context(request));
  }

  @Post()
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  invite(
    @Body() body: StaffInviteDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.staff.invite(body, actor, context(request));
  }

  @Put(":userId/role")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  changeRole(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: StaffRoleDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.staff.changeRole(userId, body, actor, context(request));
  }

  @Post(":userId/deactivate")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  deactivate(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: ReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.staff.deactivate(userId, body.reason, actor, context(request));
  }

  @Post(":userId/reactivate")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN)
  reactivate(
    @Param("userId", new ParseUUIDPipe()) userId: string,
    @Body() body: ReasonDto,
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ) {
    return this.staff.reactivate(userId, body.reason, actor, context(request));
  }
}

function context(request: Request): AdminRequestContext {
  return {
    ip: request.ip || request.socket.remoteAddress || null,
    ua: request.headers["user-agent"] ?? null,
  };
}
