import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { requiredAttendanceKey } from "./attendance.keys";
import { AttendanceService } from "./attendance.service";
import {
  AttendanceOverrideDto,
  CheckInDto,
  CheckOutDto,
} from "./dto/attendance.dto";

@ApiTags("attendance")
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get("assignments/:id/attendance")
  @Policy(Policies.authenticated())
  get(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.attendance.get(claims.sub, id);
  }

  @Post("assignments/:id/checkin")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  checkIn(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: CheckInDto,
  ) {
    return this.attendance.checkIn(
      claims.sub,
      id,
      body,
      requiredAttendanceKey(key),
    );
  }

  @Post("assignments/:id/checkout")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  checkOut(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: CheckOutDto,
  ) {
    return this.attendance.checkOut(
      claims.sub,
      id,
      body,
      requiredAttendanceKey(key),
    );
  }

  @Post("assignments/:id/checkin-override")
  @Roles(RoleMode.CUSTOMER, RoleMode.BUSINESS)
  @Policy(Policies.authenticated())
  override(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: AttendanceOverrideDto,
  ) {
    return this.attendance.overrideByPoster(
      claims.sub,
      id,
      body,
      requiredAttendanceKey(key),
    );
  }
}
