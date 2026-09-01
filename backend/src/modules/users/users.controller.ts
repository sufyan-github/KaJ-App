import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { ActivateRoleDto } from "./dto/activate-role.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("me")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post("roles/activate")
  @Policy(Policies.authenticated())
  activateRole(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: ActivateRoleDto,
  ) {
    return this.users.activateRole(claims.sub, body.role);
  }
}
