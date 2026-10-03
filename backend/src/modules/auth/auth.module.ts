import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { PrismaModule } from "../../infra/prisma/prisma.module";
import { RedisModule } from "../../infra/redis/redis.module";
import { TimeModule } from "../../common/time/time.module";
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
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { MobilePasswordController } from "./mobile-password.controller";
import { MobilePasswordService } from "./mobile-password.service";

@Module({
  controllers: [AuthController, MobilePasswordController],
  exports: [AuthService, AuthTokenService],
  imports: [
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
    TimeModule,
    SubscriptionsModule,
  ],
  providers: [
    MobilePasswordService,
    AuthService,
    AuthTokenService,
    CryptoOtpCodeGenerator,
    PrismaAuthRepository,
    RedisAuthRateLimiter,
    { provide: AUTH_REPOSITORY, useExisting: PrismaAuthRepository },
    { provide: AUTH_RATE_LIMITER, useExisting: RedisAuthRateLimiter },
    { provide: OTP_CODE_GENERATOR, useExisting: CryptoOtpCodeGenerator },
  ],
})
export class AuthModule {}
