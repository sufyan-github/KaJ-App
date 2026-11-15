import { Module } from "@nestjs/common";

import { AUTH_RATE_LIMITER } from "../auth/auth-rate-limiter";
import { RedisAuthRateLimiter } from "../auth/redis-auth-rate-limiter";

import {
  AvailabilityController,
  PublicAvailabilityController,
} from "./availability.controller";
import { AvailabilityService } from "./availability.service";

@Module({
  controllers: [AvailabilityController, PublicAvailabilityController],
  providers: [
    AvailabilityService,
    RedisAuthRateLimiter,
    { provide: AUTH_RATE_LIMITER, useExisting: RedisAuthRateLimiter },
  ],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
