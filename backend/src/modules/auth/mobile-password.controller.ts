import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AccessTokenClaims } from "./auth-token.service";
import {
  PasswordLoginDto,
  RequestPasswordRecoveryDto,
  ResetMobilePasswordDto,
  SetMobilePasswordDto,
} from "./dto/mobile-password.dto";
import { MobilePasswordService } from "./mobile-password.service";

@Controller("auth/password")
export class MobilePasswordController {
  constructor(private readonly passwords: MobilePasswordService) {}

  @Post("login")
  @Policy(Policies.public())
  login(@Body() body: PasswordLoginDto, @Req() req: Request) {
    return this.passwords.login(
      body.phone,
      body.password,
      body.deviceId,
      req.ip || "unknown",
    );
  }

  @Get("status")
  @Policy(Policies.authenticated())
  status(@CurrentUser() claims: AccessTokenClaims) {
    return this.passwords.status(claims.sub);
  }

  @Post("setup")
  @Policy(Policies.authenticated())
  setup(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: SetMobilePasswordDto,
  ) {
    return this.passwords.setup(claims, body.password);
  }

  @Post("recovery/request")
  @Policy(Policies.public())
  requestRecovery(
    @Body() body: RequestPasswordRecoveryDto,
    @Req() req: Request,
  ) {
    return this.passwords.requestRecovery(body.phone, req.ip || "unknown");
  }

  @Post("recovery/verify")
  @Policy(Policies.public())
  reset(@Body() body: ResetMobilePasswordDto, @Req() req: Request) {
    return this.passwords.reset(
      body.challengeId,
      body.code,
      body.password,
      req.ip || "unknown",
    );
  }
}
