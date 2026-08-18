import { Injectable } from "@nestjs/common";

import { RedisService } from "../../infra/redis/redis.service";
import {
  AuthRateLimitRequest,
  AuthRateLimitResult,
  AuthRateLimiter,
} from "./auth-rate-limiter";

const CONSUME_SCRIPT = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("TTL", KEYS[1])
return { count, ttl }
`;

@Injectable()
export class RedisAuthRateLimiter implements AuthRateLimiter {
  constructor(private readonly redis: RedisService) {}

  async consume(input: AuthRateLimitRequest): Promise<AuthRateLimitResult> {
    const result = (await this.redis
      .getClient()
      .eval(
        CONSUME_SCRIPT,
        1,
        `kaj:auth:${input.scope}:${input.key}`,
        input.windowSeconds,
      )) as [number, number];
    const [count, ttl] = result;
    return {
      allowed: count <= input.limit,
      retryAfterSeconds: Math.max(ttl, 1),
    };
  }
}
