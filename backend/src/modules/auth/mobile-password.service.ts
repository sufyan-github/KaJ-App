import { createHash, randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { compare, hash } from "bcryptjs";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  OPERATOR_PORT,
  OperatorPort,
} from "../../infra/operator/operator.port";
import { SMS_PORT, SmsPort } from "../../infra/sms/sms.port";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import {
  AUTH_RATE_LIMITER,
  AuthRateLimiter,
  AuthRateLimitRequest,
} from "./auth-rate-limiter";
import { AuthTokenService, AccessTokenClaims } from "./auth-token.service";
import { AuthService } from "./auth.service";
import {
  accountUnavailableError,
  invalidPhoneError,
  otpInvalidError,
  unsupportedOperatorError,
} from "./auth.errors";
import { passwordError } from "./mobile-password.errors";
import { isRobiOrAirtelPhone, normalizeBangladeshPhone } from "./phone";

const DUMMY_HASH =
  "$2b$12$BTNgwRSiFFSrmHVwh7zE/OIJNDZWHrIbhGJvBFlJlmCwtGYYt0Kx6";
const INVALID_CREDENTIALS = () =>
  passwordError(
    "AUTH_INVALID_CREDENTIALS",
    "The mobile number or password is incorrect.",
    HttpStatus.UNAUTHORIZED,
  );

@Injectable()
export class MobilePasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tokens: AuthTokenService,
    private readonly subscriptions: SubscriptionsService,
    @Inject(OPERATOR_PORT) private readonly operator: OperatorPort,
    @Inject(AUTH_RATE_LIMITER) private readonly limiter: AuthRateLimiter,
    @Inject(SMS_PORT) private readonly sms: SmsPort,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mobile_password_hash: true },
    });
    if (!user) throw accountUnavailableError();
    return { hasPassword: user.mobile_password_hash !== null };
  }

  async setup(claims: AccessTokenClaims, password: string) {
    this.validatePassword(password);
    await this.limit("password-setup", claims.sub, 5);
    // Reuse existing verification; pilot access alone is not evidence of payment.
    const overview = await this.subscriptions.mine(claims.sub);
    const paid =
      overview.current?.status === "ACTIVE" &&
      overview.current.payment?.status === "PAID";
    const carrierVerified =
      this.operator.managesRemoteBilling === true &&
      !overview.operatorStatusRefreshFailed &&
      overview.operator?.status === "VERIFIED";
    if (!paid && !carrierVerified) {
      throw passwordError(
        "PASSWORD_SUBSCRIPTION_REQUIRED",
        "Complete the existing subscription verification before setting a password.",
        HttpStatus.FORBIDDEN,
      );
    }
    const passwordHash = await hash(password, 12);
    const result = await this.prisma.user.updateMany({
      where: {
        id: claims.sub,
        status: "ACTIVE",
        deleted_at: null,
        mobile_password_hash: null,
        mobile_auth_version: claims.mobileAuthVersion ?? 0,
      },
      data: { mobile_password_hash: passwordHash },
    });
    if (result.count !== 1)
      throw passwordError(
        "PASSWORD_ALREADY_SET",
        "A password is already configured. Use password recovery to change it.",
        HttpStatus.CONFLICT,
      );
    return { hasPassword: true };
  }

  async login(phone: string, password: string, deviceId: string, ip: string) {
    const phoneE164 = this.phone(phone);
    await this.limit("password-phone", phoneE164, 10);
    await this.limit("password-ip", ip, 50);
    if (Buffer.byteLength(password, "utf8") > 72) throw INVALID_CREDENTIALS();
    const user = await this.prisma.user.findUnique({
      where: { phone_e164: phoneE164 },
    });
    const matches = await compare(
      password,
      user?.mobile_password_hash ?? DUMMY_HASH,
    );
    if (
      !user ||
      !user.mobile_password_hash ||
      !matches ||
      user.status !== "ACTIVE" ||
      user.deleted_at
    )
      throw INVALID_CREDENTIALS();
    const refresh = this.tokens.createRefreshToken(deviceId);
    const now = this.clock.now();
    await this.prisma.$transaction(async (tx) => {
      // Lock/check credential version so a racing reset cannot mint a new session.
      const valid = await tx.user.updateMany({
        where: {
          id: user.id,
          mobile_password_hash: user.mobile_password_hash,
          mobile_auth_version: user.mobile_auth_version,
          status: "ACTIVE",
          deleted_at: null,
        },
        data: { last_active_at: now },
      });
      if (valid.count !== 1) throw INVALID_CREDENTIALS();
      await tx.refreshToken.updateMany({
        where: {
          device_id: deviceId,
          user_id: { not: user.id },
          revoked_at: null,
        },
        data: { revoked_at: now },
      });
      await tx.userDevice.upsert({
        where: { id: deviceId },
        create: { id: deviceId, user_id: user.id, platform: "UNKNOWN" },
        update: { user_id: user.id, last_seen_at: now },
      });
      await tx.refreshToken.create({
        data: {
          user_id: user.id,
          device_id: deviceId,
          token_hash: refresh.record.tokenHash,
          family_id: refresh.record.familyId,
          expires_at: refresh.record.expiresAt,
        },
      });
      for (const observation of this.auth.riskObservationsFor(
        phoneE164,
        deviceId,
        ip,
      )) {
        const identity = {
          user_id: user.id,
          kind: observation.kind,
          value_hash: observation.valueHash,
        };
        await tx.riskIdentityObservation.upsert({
          where: { user_id_kind_value_hash: identity },
          create: {
            ...identity,
            first_observed_at: now,
            last_observed_at: now,
          },
          update: { last_observed_at: now, occurrences: { increment: 1 } },
        });
      }
    });
    // Authentication never requests OTP, calls billing, or creates an account.
    return {
      accessToken: await this.tokens.createAccessToken(
        {
          id: user.id,
          phoneE164,
          status: user.status,
          roles: user.role_modes,
          activeRole: user.active_role,
          isAdmin: user.is_admin,
          mobileAuthVersion: user.mobile_auth_version,
        },
        deviceId,
      ),
      refreshToken: refresh.token,
      isNewUser: false,
    };
  }

  async requestRecovery(phone: string, ip: string) {
    const phoneE164 = this.phone(phone);
    await this.limit("recovery-phone", phoneE164, 5);
    await this.limit("recovery-ip", ip, 20);
    const user = await this.prisma.user.findUnique({
      where: { phone_e164: phoneE164 },
      select: { status: true, deleted_at: true },
    });
    if (!user || user.status !== "ACTIVE" || user.deleted_at) {
      // Same public response, but no account creation or charge for an unknown number.
      return {
        challengeId: randomUUID(),
        expiresIn: this.config.get<number>("OTP_TTL_SECONDS", 300),
      };
    }
    // Explicitly consented recovery reuses the operator's existing paid OTP flow.
    return this.auth.requestOtp(phoneE164, ip, "ACCOUNT_RECOVERY");
  }

  async reset(challengeId: string, code: string, password: string, ip: string) {
    this.validatePassword(password);
    await this.limit("recovery-ip", ip, 20);
    const now = this.clock.now();
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: challengeId },
    });
    const maxAttempts = this.config.get<number>("OTP_MAX_ATTEMPTS", 5);
    if (
      !challenge ||
      challenge.purpose !== "ACCOUNT_RECOVERY" ||
      challenge.consumed_at ||
      challenge.expires_at <= now ||
      challenge.attempts >= maxAttempts
    )
      throw otpInvalidError();
    const user = await this.prisma.user.findUnique({
      where: { phone_e164: challenge.phone_e164 },
    });
    if (!user || user.status !== "ACTIVE" || user.deleted_at)
      throw otpInvalidError();
    // Claim before the carrier call: parallel requests must not verify/charge twice.
    const claimed = await this.prisma.otpChallenge.updateMany({
      where: {
        id: challengeId,
        purpose: "ACCOUNT_RECOVERY",
        consumed_at: null,
        recovery_verifying: false,
        attempts: challenge.attempts,
        expires_at: { gt: now },
      },
      data: { recovery_verifying: true, attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) throw otpInvalidError();
    let retrySafe = false;
    try {
      const verification = this.sms.verifyOtp
        ? await this.sms.verifyOtp({
            challengeId,
            code,
            phoneE164: challenge.phone_e164,
          })
        : { valid: await compare(code, challenge.code_hash) };
      if (!verification.valid) {
        retrySafe = true;
        throw otpInvalidError();
      }
      const passwordHash = await hash(password, 12);
      await this.prisma.$transaction(async (tx) => {
        const consumed = await tx.otpChallenge.updateMany({
          where: {
            id: challengeId,
            purpose: "ACCOUNT_RECOVERY",
            consumed_at: null,
            recovery_verifying: true,
            expires_at: { gt: this.clock.now() },
          },
          data: { consumed_at: this.clock.now(), recovery_verifying: false },
        });
        if (consumed.count !== 1) throw otpInvalidError();
        const changed = await tx.user.updateMany({
          where: {
            id: user.id,
            status: "ACTIVE",
            deleted_at: null,
            mobile_auth_version: user.mobile_auth_version,
          },
          data: {
            mobile_password_hash: passwordHash,
            mobile_auth_version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw otpInvalidError();
        await tx.refreshToken.updateMany({
          where: { user_id: user.id, revoked_at: null },
          data: { revoked_at: this.clock.now() },
        });
        await tx.otpChallenge.updateMany({
          where: {
            phone_e164: user.phone_e164!,
            purpose: "ACCOUNT_RECOVERY",
            consumed_at: null,
          },
          data: { consumed_at: this.clock.now() },
        });
      });
      return { reset: true };
    } finally {
      // Keep the claim on uncertain provider outcomes: never automatically retry a paid call.
      if (retrySafe)
        await this.prisma.otpChallenge.updateMany({
          where: { id: challengeId, consumed_at: null },
          data: { recovery_verifying: false },
        });
    }
  }

  private phone(input: string) {
    const phone = normalizeBangladeshPhone(input);
    if (!phone) throw invalidPhoneError();
    if (!isRobiOrAirtelPhone(phone)) throw unsupportedOperatorError();
    return phone;
  }

  private validatePassword(password: string) {
    if (
      [...password].length < 12 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      password.includes("\0")
    ) {
      throw passwordError(
        "PASSWORD_INVALID",
        "Use at least 12 characters and no more than 72 UTF-8 bytes.",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  private async limit(
    scope: AuthRateLimitRequest["scope"],
    value: string,
    limit: number,
  ) {
    const result = await this.limiter.consume({
      scope,
      key: createHash("sha256").update(value).digest("hex"),
      limit,
      windowSeconds: 900,
    });
    if (!result.allowed)
      throw passwordError(
        "AUTH_RATE_LIMITED",
        "Too many attempts. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
