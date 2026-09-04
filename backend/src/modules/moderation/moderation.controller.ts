import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "../auth/auth-token.service";
import { CreateReportDto } from "./dto/moderation.dto";
import { ModerationService } from "./moderation.service";

@ApiTags("safety")
@Controller()
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post("reports")
  @Policy(Policies.authenticated())
  report(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: CreateReportDto,
  ) {
    return this.moderation.createReport(claims.sub, body);
  }

  @Get("reports/mine")
  @Policy(Policies.authenticated())
  mine(@CurrentUser() claims: AccessTokenClaims) {
    return this.moderation.mine(claims.sub);
  }

  @Get("me/blocks")
  @Policy(Policies.authenticated())
  blocks(@CurrentUser() claims: AccessTokenClaims) {
    return this.moderation.blocks(claims.sub);
  }
}
