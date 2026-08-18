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
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { AccessTokenGuard } from "./access-token.guard";
import { AuthService } from "./auth.service";
import { AccessTokenClaims } from "./auth-token.service";
import { CurrentAuth } from "./current-auth.decorator";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  requestOtp(@Body() body: RequestOtpDto, @Req() request: Request) {
    return this.auth.requestOtp(
      body.phone,
      request.ip || request.socket.remoteAddress || "unknown",
    );
  }

  @Post("otp/verify")
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(body.challengeId, body.code, body.deviceId);
  }

  @Post("refresh")
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshTokenDto): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Body() body: RefreshTokenDto): Promise<void> {
    await this.auth.logoutAll(body.refreshToken);
  }

  @Get("session")
  @UseGuards(AccessTokenGuard)
  getSession(@CurrentAuth() claims: AccessTokenClaims) {
    return this.auth.getSession(claims);
  }

  @Post("devices")
  @UseGuards(AccessTokenGuard)
  registerDevice(
    @CurrentAuth() claims: AccessTokenClaims,
    @Body() body: RegisterDeviceDto,
  ) {
    return this.auth.registerDevice(claims, body);
  }

  @Delete("devices/:id")
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDevice(
    @CurrentAuth() claims: AccessTokenClaims,
    @Param("id", new ParseUUIDPipe()) deviceId: string,
  ): Promise<void> {
    await this.auth.deleteDevice(claims, deviceId);
  }
}
