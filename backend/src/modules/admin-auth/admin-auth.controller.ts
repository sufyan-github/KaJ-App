import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { AdminAuthService } from "./admin-auth.service";
import { CurrentAdmin } from "./admin-auth.decorators";
import { AdminSessionGuard } from "./admin-session.guard";
import { AdminActor, AdminRequestContext } from "./admin-auth.types";
import { AdminLoginDto, AdminTotpDto } from "./dto/admin-auth.dto";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post("login")
  @Policy(Policies.public())
  login(@Body() body: AdminLoginDto, @Req() request: Request) {
    return this.auth.login(body.email, body.password, this.context(request));
  }

  @Post("totp")
  @Policy(Policies.public())
  verify(@Body() body: AdminTotpDto, @Req() request: Request) {
    return this.auth.verifyTotp(
      body.challengeToken,
      body.code,
      this.context(request),
    );
  }

  @Get("session")
  @Policy(Policies.public())
  @UseGuards(AdminSessionGuard)
  session(@CurrentAdmin() actor: AdminActor, @Req() request: Request) {
    return this.auth.session(actor, this.context(request));
  }

  @Post("logout")
  @Policy(Policies.public())
  @UseGuards(AdminSessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAdmin() actor: AdminActor,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(actor, this.context(request));
  }

  private context(request: Request): AdminRequestContext {
    return {
      ip: request.ip || request.socket.remoteAddress || null,
      ua: request.headers["user-agent"] ?? null,
    };
  }
}
