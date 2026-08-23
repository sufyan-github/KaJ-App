import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from "@nestjs/common";
import { Request } from "express";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AuthService } from "./auth.service";
import { AccessTokenClaims } from "./auth-token.service";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  @Policy(Policies.public())
  requestOtp(@Body() body: RequestOtpDto, @Req() request: Request) {
    return this.auth.requestOtp(
      body.phone,
      request.ip || request.socket.remoteAddress || "unknown",
    );
  }

  @Post("otp/verify")
  @Policy(Policies.public())
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(body.challengeId, body.code, body.deviceId);
  }

  @Post("refresh")
  @Policy(Policies.public())
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @Policy(Policies.public())
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Post("logout-all")
  @Policy(Policies.public())
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Body() body: RefreshTokenDto): Promise<void> {
    await this.auth.logoutAll(body.refreshToken);
  }

  @Get("session")
  @Policy(Policies.authenticated())
  getSession(@CurrentUser() claims: AccessTokenClaims) {
    return this.auth.getSession(claims);
  }

  @Post("devices")
  @Policy(Policies.authenticated())
  registerDevice(
    @CurrentUser() claims: AccessTokenClaims,
    @Body() body: RegisterDeviceDto,
  ) {
    return this.auth.registerDevice(claims, body);
  }

  @Delete("devices/:id")
  @Policy(Policies.authenticated())
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDevice(
    @CurrentUser() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) deviceId: string,
  ): Promise<void> {
    await this.auth.deleteDevice(claims, deviceId);
  }
}
