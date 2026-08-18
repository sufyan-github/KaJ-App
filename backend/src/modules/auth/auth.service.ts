import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { compare, hash } from "bcryptjs";

import { CLOCK, Clock } from "../../common/time/clock";
import { SMS_PORT, SmsPort } from "../../infra/sms/sms.port";
import {
  accessTokenInvalidError,
  accountUnavailableError,
  deviceNotFoundError,
  invalidPhoneError,
  otpAlreadyUsedError,
  otpAttemptsExceededError,
  otpExpiredError,
  otpInvalidError,
  otpNotFoundError,
  otpRateLimitError,
  refreshInvalidError,
  refreshReuseError,
} from "./auth.errors";
import { AUTH_RATE_LIMITER, AuthRateLimiter } from "./auth-rate-limiter";
import {
  AUTH_REPOSITORY,
  AuthRepository,
  AuthSession,
  UpsertDeviceInput,
} from "./auth.repository";
import { AccessTokenClaims, AuthTokenService } from "./auth-token.service";
import { OTP_CODE_GENERATOR, OtpCodeGenerator } from "./otp-code.generator";
import { normalizeBangladeshPhone } from "./phone";

const OTP_BCRYPT_ROUNDS = 10;
const OTP_WINDOW_SECONDS = 3_600;
const OTP_PHONE_LIMIT = 5;
const OTP_IP_LIMIT = 20;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly maxOtpAttempts: number;
  private readonly otpCooldownSeconds: number;
  private readonly otpTtlSeconds: number;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly repository: AuthRepository,
    @Inject(AUTH_RATE_LIMITER) private readonly rateLimiter: AuthRateLimiter,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
    @Inject(OTP_CODE_GENERATOR)
    private readonly otpCodeGenerator: OtpCodeGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService,
    private readonly tokens: AuthTokenService,
  ) {
    this.maxOtpAttempts = config.get<number>("OTP_MAX_ATTEMPTS", 5);
    this.otpCooldownSeconds = config.get<number>(
      "OTP_RESEND_COOLDOWN_SECONDS",
      60,
    );
    this.otpTtlSeconds = config.get<number>("OTP_TTL_SECONDS", 300);
  }

  async requestOtp(
    phone: string,
    ipAddress: string,
  ): Promise<{ challengeId: string; expiresIn: number }> {
    const phoneE164 = normalizeBangladeshPhone(phone);
    if (!phoneE164) throw invalidPhoneError();

    await this.enforceRateLimit(
      "otp-phone",
      this.rateLimitKey(phoneE164),
      OTP_PHONE_LIMIT,
      OTP_WINDOW_SECONDS,
    );
    await this.enforceRateLimit(
      "otp-ip",
      this.rateLimitKey(ipAddress),
      OTP_IP_LIMIT,
      OTP_WINDOW_SECONDS,
    );
    if (this.otpCooldownSeconds > 0) {
      await this.enforceRateLimit(
        "otp-cooldown",
        this.rateLimitKey(phoneE164),
        1,
        this.otpCooldownSeconds,
      );
    }

    const code = this.otpCodeGenerator.generate();
    const codeHash = await hash(code, OTP_BCRYPT_ROUNDS);
    const expiresAt = new Date(
      this.clock.now().getTime() + this.otpTtlSeconds * 1_000,
    );
    const challenge = await this.repository.createOtpChallenge({
      codeHash,
      expiresAt,
      phoneE164,
    });
    await this.sms.sendOtp({
      challengeId: challenge.id,
      code,
      expiresInSeconds: this.otpTtlSeconds,
      phoneE164,
    });
    return { challengeId: challenge.id, expiresIn: this.otpTtlSeconds };
  }

  async verifyOtp(
    challengeId: string,
    code: string,
    deviceId: string,
  ): Promise<TokenPair & { isNewUser: boolean }> {
    const challenge = await this.repository.findOtpChallenge(challengeId);
    if (!challenge) throw otpNotFoundError();
    if (challenge.consumedAt) throw otpAlreadyUsedError();
    if (challenge.expiresAt.getTime() <= this.clock.now().getTime()) {
      throw otpExpiredError();
    }
    if (challenge.attempts >= this.maxOtpAttempts) {
      throw otpAttemptsExceededError();
    }

    if (!(await compare(code, challenge.codeHash))) {
      const counted = await this.repository.incrementOtpAttempts(
        challenge.id,
        this.maxOtpAttempts,
      );
      if (!counted) throw otpAttemptsExceededError();
      throw otpInvalidError();
    }

    const refresh = this.tokens.createRefreshToken(deviceId);
    const session = await this.repository.consumeChallengeAndCreateSession({
      challengeId: challenge.id,
      expectedAttempts: challenge.attempts,
      now: this.clock.now(),
      phoneE164: challenge.phoneE164,
      refreshToken: refresh.record,
    });
    if (!session) throw otpAlreadyUsedError();
    if (session.user.status !== "ACTIVE") {
      await this.repository.revokeRefreshFamily(
        refresh.record.familyId,
        this.clock.now(),
      );
      throw accountUnavailableError();
    }

    return {
      accessToken: await this.tokens.createAccessToken(session.user, deviceId),
      isNewUser: session.isNewUser,
      refreshToken: refresh.token,
    };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const current = await this.repository.findRefreshTokenByHash(
      this.tokens.hashRefreshToken(refreshToken),
    );
    if (!current) throw refreshInvalidError();
    if (current.revokedAt) {
      await this.repository.revokeRefreshFamily(
        current.familyId,
        this.clock.now(),
      );
      throw refreshReuseError();
    }
    if (
      current.expiresAt.getTime() <= this.clock.now().getTime() ||
      current.user.status !== "ACTIVE"
    ) {
      await this.repository.revokeRefreshFamily(
        current.familyId,
        this.clock.now(),
      );
      throw refreshInvalidError();
    }

    const next = this.tokens.createRefreshToken(
      current.deviceId,
      current.familyId,
    );
    const rotated = await this.repository.rotateRefreshToken({
      currentTokenId: current.id,
      nextToken: next.record,
      now: this.clock.now(),
    });
    if (!rotated) {
      await this.repository.revokeRefreshFamily(
        current.familyId,
        this.clock.now(),
      );
      throw refreshReuseError();
    }

    return {
      accessToken: await this.tokens.createAccessToken(
        current.user,
        current.deviceId,
      ),
      refreshToken: next.token,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repository.revokeRefreshTokenByHash(
      this.tokens.hashRefreshToken(refreshToken),
      this.clock.now(),
    );
  }

  async logoutAll(refreshToken: string): Promise<void> {
    const current = await this.repository.findRefreshTokenByHash(
      this.tokens.hashRefreshToken(refreshToken),
    );
    if (!current) return;
    await this.repository.revokeRefreshFamily(
      current.familyId,
      this.clock.now(),
    );
  }

  async getSession(claims: AccessTokenClaims): Promise<AuthSession> {
    const session = await this.repository.findSession(claims.sub);
    if (!session || session.user.status !== "ACTIVE") {
      throw accessTokenInvalidError();
    }
    return session;
  }

  async registerDevice(
    claims: AccessTokenClaims,
    input: Omit<UpsertDeviceInput, "deviceId" | "userId">,
  ): Promise<{ id: string }> {
    await this.repository.upsertDevice({
      ...input,
      deviceId: claims.deviceId,
      userId: claims.sub,
    });
    return { id: claims.deviceId };
  }

  async deleteDevice(
    claims: AccessTokenClaims,
    deviceId: string,
  ): Promise<void> {
    if (!(await this.repository.deleteDevice(deviceId, claims.sub))) {
      throw deviceNotFoundError();
    }
  }

  private rateLimitKey(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private async enforceRateLimit(
    scope: "otp-cooldown" | "otp-ip" | "otp-phone",
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<void> {
    const result = await this.rateLimiter.consume({
      key,
      limit,
      scope,
      windowSeconds,
    });
    if (!result.allowed) throw otpRateLimitError(result.retryAfterSeconds);
  }
}
