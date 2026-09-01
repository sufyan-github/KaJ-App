import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { AvailabilityService } from "./availability.service";
import {
  CreateAvailabilityExceptionDto,
  ReplaceAvailabilityDto,
} from "./dto/availability.dto";

@ApiTags("availability")
@Controller("profiles/me/availability")
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get()
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  getAvailability(@CurrentUser() claims: AccessTokenClaims) {
    return this.availability.getAvailability(claims.sub);
  }

  @Put()
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  replaceRules(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: ReplaceAvailabilityDto,
  ) {
    return this.availability.replaceRules(claims.sub, body.rules);
  }

  @Post("exceptions")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  createException(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateAvailabilityExceptionDto,
  ) {
    return this.availability.createException(claims.sub, body);
  }

  @Delete("exceptions/:id")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  deleteException(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    return this.availability.deleteException(claims.sub, id);
  }
}
