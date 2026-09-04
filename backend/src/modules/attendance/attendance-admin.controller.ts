import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
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
import { requiredAttendanceKey } from "./attendance.keys";
import { AttendanceService } from "./attendance.service";
import { AttendanceOverrideDto } from "./dto/attendance.dto";

@Controller("admin/assignments")
@UseGuards(AdminSessionGuard)
export class AttendanceAdminController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post(":id/checkin-override")
  @Policy(Policies.public())
  @AdminRoles(AdminRole.ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT)
  override(
    @CurrentAdmin() actor: AdminActor,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: AttendanceOverrideDto,
    @Req() request: Request,
  ) {
    return this.attendance.overrideByAdmin(
      actor,
      id,
      body,
      requiredAttendanceKey(key),
      {
        ip: request.ip ?? null,
        ua: request.get("user-agent") ?? null,
      },
    );
  }
}
