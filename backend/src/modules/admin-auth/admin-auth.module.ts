import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infra/prisma/prisma.module";
import { AUTH_RATE_LIMITER } from "../auth/auth-rate-limiter";
import { RedisAuthRateLimiter } from "../auth/redis-auth-rate-limiter";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminSessionGuard } from "./admin-session.guard";

@Module({
  controllers: [AdminAuthController],
  exports: [AdminAuthService, AdminSessionGuard],
  imports: [PrismaModule],
  providers: [
    AdminAuthService,
    AdminSessionGuard,
    RedisAuthRateLimiter,
    { provide: AUTH_RATE_LIMITER, useExisting: RedisAuthRateLimiter },
  ],
})
export class AdminAuthModule {}
