import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { SubmitVerificationDto } from "./dto/verification.dto";
import { VerificationService } from "./verification.service";

@ApiTags("verification")
@Controller("verification-requests")
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Post()
  @Policy(Policies.authenticated())
  submit(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: SubmitVerificationDto,
  ) {
    return this.verification.submit(claims.sub, body);
  }

  @Get("mine")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.verification.mine(claims.sub);
  }
}
