export const AUTH_RATE_LIMITER = Symbol("AUTH_RATE_LIMITER");

export interface AuthRateLimitRequest {
  key: string;
  limit: number;
  scope: "otp-cooldown" | "otp-ip" | "otp-phone";
  windowSeconds: number;
}

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface AuthRateLimiter {
  consume(input: AuthRateLimitRequest): Promise<AuthRateLimitResult>;
}
