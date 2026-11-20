export const AUTH_RATE_LIMITER = Symbol("AUTH_RATE_LIMITER");

export interface AuthRateLimitRequest {
  key: string;
  limit: number;
  scope:
    | "otp-cooldown"
    | "otp-ip"
    | "otp-phone"
    | "password-phone"
    | "password-ip"
    | "recovery-phone"
    | "recovery-ip"
    | "password-setup"
    | "certificate-ip"
    | "admin-login-email"
    | "admin-login-ip"
    | "slots-viewer"
    // API-3: per-user action limits (common/rate-limit/user-rate-limit.ts).
    | `user-${string}`;
  windowSeconds: number;
}

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface AuthRateLimiter {
  consume(input: AuthRateLimitRequest): Promise<AuthRateLimitResult>;
}
