import { Body, Controller, Get, Put } from "@nestjs/common";
import { RoleMode } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdateWorkerProfileDto } from "./dto/update-worker-profile.dto";
import { UpdateWorkerSkillsDto } from "./dto/update-worker-skills.dto";
import { UsersService } from "./users.service";

@ApiTags("profiles")
@Controller("profiles/me")
export class ProfilesController {
  constructor(private readonly users: UsersService) {}

  @Put()
  @Policy(Policies.authenticated())
  updateProfile(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateProfileDto,
  ) {
    return this.users.updateProfile(claims.sub, body);
  }

  @Get("skills")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  getWorkerSkills(@CurrentUser() claims: AccessTokenClaims) {
    return this.users.getWorkerSkills(claims.sub);
  }

  @Put("skills")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  updateWorkerSkills(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateWorkerSkillsDto,
  ) {
    return this.users.updateWorkerSkills(claims.sub, body.skills);
  }

  @Put("worker")
  @Roles(RoleMode.WORKER)
  @Policy(Policies.authenticated())
  updateWorkerProfile(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: UpdateWorkerProfileDto,
  ) {
    return this.users.updateWorkerRates(claims.sub, body);
  }
}
