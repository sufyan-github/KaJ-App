import {
  CanActivate,
  ExecutionContext,
  Global,
  Injectable,
  Module,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RedisService } from "../../infra/redis/redis.service";
import { RedisAuthRateLimiter } from "../../modules/auth/redis-auth-rate-limiter";
import { RateLimitException } from "../errors/rate-limit.exception";
import { AuthenticatedRequest } from "../guards/jwt.guard";

/**
 * API-3: per-person limits on actions that can flood or harass someone, or
 * bury the moderation queue. Counted per signed-in user in Redis (the same
 * fixed-window counter the sign-in limits use). Limits are generous for real
 * use; exceeding one answers 429 RATE_LIMITED with Retry-After.
 */
export const USER_RATE_LIMITS = {
  /** Chat messages, HTTP and socket together. */
  "chat-send": { limit: 30, windowSeconds: 60 },
  /** Safety reports. */
  "report-create": { limit: 10, windowSeconds: 24 * 60 * 60 },
  /** Upload URLs. */
  "upload-sign": { limit: 30, windowSeconds: 60 * 60 },
  /** Direct booking requests to workers. */
  "booking-request": { limit: 20, windowSeconds: 24 * 60 * 60 },
  /** Consultation bookings (each holds an expert's free time). */
  "consultation-hold": { limit: 10, windowSeconds: 24 * 60 * 60 },
  /** Invitations to sessions, groups and businesses. */
  invite: { limit: 30, windowSeconds: 60 * 60 },
} as const;

export type UserRateLimitScope = keyof typeof USER_RATE_LIMITS;

const USER_RATE_LIMIT_METADATA = "kaj:user-rate-limit";

/** Counts this route against the caller's `scope` limit. */
export const UserRateLimit = (scope: UserRateLimitScope) =>
  SetMetadata(USER_RATE_LIMIT_METADATA, scope);

export const rateLimitedError = (retryAfterSeconds: number) =>
  new RateLimitException(
    {
      action: null,
      code: "RATE_LIMITED",
      details: [],
      field: null,
      message: "Too many requests. Try again later.",
      messageKey: "error.common.rate_limited",
      retryable: true,
    },
    retryAfterSeconds,
  );

@Injectable()
export class UserRateLimiter {
  private readonly counter: RedisAuthRateLimiter;

  constructor(redis: RedisService) {
    this.counter = new RedisAuthRateLimiter(redis);
  }

  /** Counts one action; throws 429 RATE_LIMITED once over the limit. */
  async consume(userId: string, scope: UserRateLimitScope): Promise<void> {
    const rule = USER_RATE_LIMITS[scope];
    const result = await this.counter.consume({
      key: userId,
      limit: rule.limit,
      scope: `user-${scope}`,
      windowSeconds: rule.windowSeconds,
    });
    if (!result.allowed) throw rateLimitedError(result.retryAfterSeconds);
  }
}

/** Runs after the auth and policy guards, so only allowed calls count. */
@Injectable()
export class UserRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: UserRateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.getAllAndOverride<UserRateLimitScope>(
      USER_RATE_LIMIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!scope) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) return true;
    await this.limiter.consume(request.auth.sub, scope);
    return true;
  }
}

@Global()
@Module({ providers: [UserRateLimiter], exports: [UserRateLimiter] })
export class UserRateLimitModule {}
