import { createHash } from "node:crypto";

import { Inject, Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdminRole, Prisma } from "@prisma/client";
import { compare } from "bcryptjs";

import { RateLimitException } from "../../common/errors/rate-limit.exception";
import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AUTH_RATE_LIMITER,
  type AuthRateLimiter,
} from "../auth/auth-rate-limiter";
import {
  adminSessionInvalidError,
  invalidAdminChallengeError,
  invalidAdminCredentialsError,
  invalidAdminTotpError,
} from "./admin-auth.errors";
import {
  decryptTotpSecret,
  opaqueToken,
  tokenHash,
  verifyTotp,
} from "./admin-auth.primitives";
import { AdminActor, AdminRequestContext } from "./admin-auth.types";

const CHALLENGE_TTL_MS = 5 * 60_000;
const SESSION_IDLE_TTL_MS = 30 * 60_000;
const MAX_TOTP_ATTEMPTS = 5;
const DUMMY_PASSWORD_HASH =
  "$2b$12$BTNgwRSiFFSrmHVwh7zE/OIJNDZWHrIbhGJvBFlJlmCwtGYYt0Kx6";

@Injectable()
export class AdminAuthService {
  private readonly sessionSecret: string;
  private readonly totpEncryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Optional()
    @Inject(AUTH_RATE_LIMITER)
    private readonly limiter?: AuthRateLimiter,
  ) {
    this.sessionSecret =
      config.get<string>("ADMIN_SESSION_SECRET") ||
      createHash("sha256")
        .update("kaj:admin-session:local-development-only")
        .digest("hex");
    this.totpEncryptionKey =
      config.get<string>("ADMIN_TOTP_ENCRYPTION_KEY") ||
      createHash("sha256")
        .update("kaj:admin-totp:local-development-only")
        .digest("hex");
  }

  private async limitLogin(
    scope: "admin-login-email" | "admin-login-ip",
    value: string,
    limit: number,
  ) {
    if (!this.limiter) return;
    const result = await this.limiter.consume({
      scope,
      key: createHash("sha256").update(value).digest("hex"),
      limit,
      windowSeconds: 900,
    });
    if (!result.allowed)
      throw new RateLimitException(
        {
          action: null,
          code: "ADMIN_LOGIN_RATE_LIMITED",
          details: [],
          field: null,
          message: "Too many sign-in attempts. Try again later.",
          messageKey: "error.admin.login_rate_limited",
          retryable: true,
        },
        result.retryAfterSeconds,
      );
  }

  async login(
    email: string,
    password: string,
    context: AdminRequestContext,
  ): Promise<{ challengeToken: string; expiresIn: number }> {
    // Counted before the password check so guesses are limited whether or not
    // they succeed, per account and per address.
    await this.limitLogin("admin-login-email", email.trim().toLowerCase(), 5);
    await this.limitLogin("admin-login-ip", context.ip ?? "unknown", 20);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { admin_credential: true },
    });
    const passwordMatches = await compare(
      password,
      user?.password_hash ?? DUMMY_PASSWORD_HASH,
    );
    const valid =
      user?.is_admin === true &&
      user.status === "ACTIVE" &&
      !!user.password_hash &&
      !!user.admin_credential?.totp_confirmed_at &&
      passwordMatches;
    if (!valid || !user?.admin_credential) {
      await this.audit(
        null,
        "ADMIN_LOGIN_REJECTED",
        "USER",
        user?.id ?? null,
        null,
        null,
        context,
      );
      throw invalidAdminCredentialsError();
    }

    const challengeToken = opaqueToken();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.adminLoginChallenge.create({
        data: {
          user_id: user.id,
          token_hash: tokenHash(challengeToken, this.sessionSecret),
          expires_at: expiresAt,
          ip: context.ip,
          ua: context.ua,
        },
      }),
      this.prisma.auditLog.create({
        data: this.auditData(
          user.id,
          "ADMIN_LOGIN_PASSWORD_ACCEPTED",
          "USER",
          user.id,
          null,
          { requiresTotp: true },
          context,
        ),
      }),
    ]);
    return { challengeToken, expiresIn: CHALLENGE_TTL_MS / 1_000 };
  }

  async verifyTotp(
    challengeToken: string,
    code: string,
    context: AdminRequestContext,
  ): Promise<{
    expiresIn: number;
    sessionToken: string;
    user: { email: string; role: AdminRole; userId: string };
  }> {
    const challenge = await this.prisma.adminLoginChallenge.findUnique({
      where: { token_hash: tokenHash(challengeToken, this.sessionSecret) },
      include: { user: { include: { admin_credential: true } } },
    });
    if (
      !challenge ||
      challenge.consumed_at ||
      challenge.expires_at.getTime() <= Date.now() ||
      !challenge.user.is_admin ||
      challenge.user.status !== "ACTIVE" ||
      !challenge.user.admin_credential
    ) {
      throw invalidAdminChallengeError();
    }
    // Reserve an attempt atomically before checking the code. Checking the
    // count and incrementing later let parallel guesses exceed the limit.
    const reserved = await this.prisma.adminLoginChallenge.updateMany({
      where: {
        id: challenge.id,
        consumed_at: null,
        attempts: { lt: MAX_TOTP_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (reserved.count !== 1) throw invalidAdminChallengeError();
    const credential = challenge.user.admin_credential;
    const secret = decryptTotpSecret(
      credential.totp_secret_ciphertext,
      this.totpEncryptionKey,
    );
    const counter = verifyTotp(secret, code, new Date());
    if (
      counter === null ||
      (credential.last_totp_counter ?? -1n) >= BigInt(counter)
    ) {
      await this.prisma.$transaction([
        this.prisma.auditLog.create({
          data: this.auditData(
            challenge.user_id,
            "ADMIN_TOTP_REJECTED",
            "USER",
            challenge.user_id,
            null,
            { challengeId: challenge.id },
            context,
          ),
        }),
      ]);
      throw invalidAdminTotpError();
    }

    const sessionToken = opaqueToken();
    const expiresAt = new Date(Date.now() + SESSION_IDLE_TTL_MS);
    const sessionCreated = await this.prisma.$transaction(
      async (transaction) => {
        const claimedCounter = await transaction.adminCredential.updateMany({
          where: {
            user_id: challenge.user_id,
            OR: [
              { last_totp_counter: null },
              { last_totp_counter: { lt: BigInt(counter) } },
            ],
          },
          data: { last_totp_counter: BigInt(counter) },
        });
        if (claimedCounter.count !== 1) return false;
        const consumed = await transaction.adminLoginChallenge.updateMany({
          where: { id: challenge.id, consumed_at: null },
          data: { consumed_at: new Date() },
        });
        if (consumed.count !== 1) return false;
        await transaction.adminSession.create({
          data: {
            user_id: challenge.user_id,
            token_hash: tokenHash(sessionToken, this.sessionSecret),
            expires_at: expiresAt,
            ip: context.ip,
            ua: context.ua,
          },
        });
        await transaction.auditLog.create({
          data: this.auditData(
            challenge.user_id,
            "ADMIN_LOGIN_SUCCEEDED",
            "USER",
            challenge.user_id,
            null,
            { role: credential.role },
            context,
          ),
        });
        return true;
      },
    );
    if (!sessionCreated) {
      await this.audit(
        challenge.user_id,
        "ADMIN_TOTP_REPLAY_REJECTED",
        "USER",
        challenge.user_id,
        null,
        { challengeId: challenge.id },
        context,
      );
      throw invalidAdminTotpError();
    }
    return {
      expiresIn: SESSION_IDLE_TTL_MS / 1_000,
      sessionToken,
      user: {
        email: challenge.user.email!,
        role: credential.role,
        userId: challenge.user_id,
      },
    };
  }

  async authenticate(sessionToken: string): Promise<AdminActor> {
    const session = await this.prisma.adminSession.findUnique({
      where: { token_hash: tokenHash(sessionToken, this.sessionSecret) },
      include: { user: { include: { admin_credential: true } } },
    });
    if (
      !session ||
      session.revoked_at ||
      session.expires_at.getTime() <= Date.now() ||
      !session.user.is_admin ||
      session.user.status !== "ACTIVE" ||
      !session.user.admin_credential ||
      !session.user.email
    ) {
      throw adminSessionInvalidError();
    }
    await this.prisma.adminSession.update({
      where: { id: session.id },
      data: {
        last_active_at: new Date(),
        expires_at: new Date(Date.now() + SESSION_IDLE_TTL_MS),
      },
    });
    return {
      email: session.user.email,
      role: session.user.admin_credential.role,
      sessionId: session.id,
      userId: session.user_id,
    };
  }

  async session(actor: AdminActor, context: AdminRequestContext) {
    await this.audit(
      actor.userId,
      "ADMIN_SESSION_VIEWED",
      "ADMIN_SESSION",
      actor.sessionId,
      null,
      null,
      context,
    );
    return {
      email: actor.email,
      role: actor.role,
      userId: actor.userId,
      expiresIn: SESSION_IDLE_TTL_MS / 1_000,
    };
  }

  async logout(actor: AdminActor, context: AdminRequestContext): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.adminSession.update({
        where: { id: actor.sessionId },
        data: { revoked_at: new Date() },
      }),
      this.prisma.auditLog.create({
        data: this.auditData(
          actor.userId,
          "ADMIN_LOGOUT",
          "ADMIN_SESSION",
          actor.sessionId,
          null,
          { revoked: true },
          context,
        ),
      }),
    ]);
  }

  private audit(
    actorUserId: string | null,
    action: string,
    entity: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
  ) {
    return this.prisma.auditLog.create({
      data: this.auditData(
        actorUserId,
        action,
        entity,
        entityId,
        before,
        after,
        context,
      ),
    });
  }

  private auditData(
    actorUserId: string | null,
    action: string,
    entity: string,
    entityId: string | null,
    before: Prisma.InputJsonValue | null,
    after: Prisma.InputJsonValue | null,
    context: AdminRequestContext,
  ): Prisma.AuditLogUncheckedCreateInput {
    return {
      actor_user_id: actorUserId,
      action,
      entity,
      entity_id: entityId,
      before_json: before ?? Prisma.JsonNull,
      after_json: after ?? Prisma.JsonNull,
      ip: context.ip,
      ua: context.ua,
    };
  }
}
