import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { ConsoleSmsAdapter } from "../../infra/sms/console.adapter";
import { SMS_PORT } from "../../infra/sms/sms.port";
import { PrismaModule } from "../../infra/prisma/prisma.module";
import { RedisModule } from "../../infra/redis/redis.module";
import { TimeModule } from "../../common/time/time.module";
import { AccessTokenGuard } from "./access-token.guard";
import { AuthController } from "./auth.controller";
import { AUTH_RATE_LIMITER } from "./auth-rate-limiter";
import { AUTH_REPOSITORY } from "./auth.repository";
import { AuthService } from "./auth.service";
import { AuthTokenService } from "./auth-token.service";
import {
  CryptoOtpCodeGenerator,
  OTP_CODE_GENERATOR,
} from "./otp-code.generator";
import { PrismaAuthRepository } from "./prisma-auth.repository";
import { RedisAuthRateLimiter } from "./redis-auth-rate-limiter";

@Module({
  controllers: [AuthController],
  exports: [AccessTokenGuard, AuthService],
  imports: [JwtModule.register({}), PrismaModule, RedisModule, TimeModule],
  providers: [
    AccessTokenGuard,
    AuthService,
    AuthTokenService,
    ConsoleSmsAdapter,
    CryptoOtpCodeGenerator,
    PrismaAuthRepository,
    RedisAuthRateLimiter,
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
    { provide: AUTH_RATE_LIMITER, useExisting: RedisAuthRateLimiter },
    { provide: SMS_PORT, useExisting: ConsoleSmsAdapter },
    { provide: OTP_CODE_GENERATOR, useExisting: CryptoOtpCodeGenerator },
  ],
})
export class AuthModule {}
