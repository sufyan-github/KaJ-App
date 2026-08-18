import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/prisma/prisma.service";
import {
  AuthRepository,
  AuthSession,
  AuthUser,
  ConsumeChallengeInput,
  CreateOtpChallengeInput,
  RotateRefreshTokenInput,
  StoredOtpChallenge,
  StoredRefreshToken,
  UpsertDeviceInput,
} from "./auth.repository";

const userSelect = {
  active_role: true,
  id: true,
  is_admin: true,
  phone_e164: true,
  role_modes: true,
  status: true,
} as const;

function toAuthUser(user: {
  active_role: AuthUser["activeRole"];
  id: string;
  is_admin: boolean;
  phone_e164: string | null;
  role_modes: AuthUser["roles"];
  status: AuthUser["status"];
}): AuthUser {
  if (!user.phone_e164)
    throw new Error("Authenticated user has no phone number");
  return {
    activeRole: user.active_role,
    id: user.id,
    isAdmin: user.is_admin,
    phoneE164: user.phone_e164,
    roles: user.role_modes,
    status: user.status,
  };
}

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createOtpChallenge(
    input: CreateOtpChallengeInput,
  ): Promise<{ id: string }> {
    return this.prisma.otpChallenge.create({
      data: {
        code_hash: input.codeHash,
        expires_at: input.expiresAt,
        phone_e164: input.phoneE164,
      },
      select: { id: true },
    });
  }

  async findOtpChallenge(id: string): Promise<StoredOtpChallenge | null> {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id },
    });
    return challenge
      ? {
          attempts: challenge.attempts,
          codeHash: challenge.code_hash,
          consumedAt: challenge.consumed_at,
          expiresAt: challenge.expires_at,
          id: challenge.id,
          phoneE164: challenge.phone_e164,
        }
      : null;
  }

  async incrementOtpAttempts(
    id: string,
    maxAttempts: number,
  ): Promise<boolean> {
    const result = await this.prisma.otpChallenge.updateMany({
      data: { attempts: { increment: 1 } },
      where: { attempts: { lt: maxAttempts }, consumed_at: null, id },
    });
    return result.count === 1;
  }

  async consumeChallengeAndCreateSession(
    input: ConsumeChallengeInput,
  ): Promise<{ isNewUser: boolean; user: AuthUser } | null> {
    return this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.otpChallenge.updateMany({
        data: { consumed_at: input.now },
        where: {
          attempts: input.expectedAttempts,
          consumed_at: null,
          expires_at: { gt: input.now },
          id: input.challengeId,
        },
      });
      if (consumed.count !== 1) return null;

      const existing = await transaction.user.findUnique({
        select: userSelect,
        where: { phone_e164: input.phoneE164 },
      });
      const user =
        existing ??
        (await transaction.user.create({
          data: { phone_e164: input.phoneE164 },
          select: userSelect,
        }));

      await transaction.refreshToken.updateMany({
        data: { revoked_at: input.now },
        where: {
          device_id: input.refreshToken.deviceId,
          revoked_at: null,
          user_id: { not: user.id },
        },
      });
      await transaction.userDevice.upsert({
        create: {
          id: input.refreshToken.deviceId,
          platform: "UNKNOWN",
          user_id: user.id,
        },
        update: { last_seen_at: input.now, user_id: user.id },
        where: { id: input.refreshToken.deviceId },
      });
      await transaction.refreshToken.create({
        data: {
          device_id: input.refreshToken.deviceId,
          expires_at: input.refreshToken.expiresAt,
          family_id: input.refreshToken.familyId,
          token_hash: input.refreshToken.tokenHash,
          user_id: user.id,
        },
      });

      return { isNewUser: !existing, user: toAuthUser(user) };
    });
  }

  async findRefreshTokenByHash(
    tokenHash: string,
  ): Promise<StoredRefreshToken | null> {
    const token = await this.prisma.refreshToken.findUnique({
      include: { user: { select: userSelect } },
      where: { token_hash: tokenHash },
    });
    return token
      ? {
          deviceId: token.device_id,
          expiresAt: token.expires_at,
          familyId: token.family_id,
          id: token.id,
          revokedAt: token.revoked_at,
          tokenHash: token.token_hash,
          user: toAuthUser(token.user),
        }
      : null;
  }

  async rotateRefreshToken(input: RotateRefreshTokenInput): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        data: { revoked_at: input.now },
        where: { id: input.currentTokenId, revoked_at: null },
      });
      if (revoked.count !== 1) return false;
      const current = await transaction.refreshToken.findUniqueOrThrow({
        select: { user_id: true },
        where: { id: input.currentTokenId },
      });
      await transaction.refreshToken.create({
        data: {
          device_id: input.nextToken.deviceId,
          expires_at: input.nextToken.expiresAt,
          family_id: input.nextToken.familyId,
          token_hash: input.nextToken.tokenHash,
          user_id: current.user_id,
        },
      });
      return true;
    });
  }

  async revokeRefreshFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      data: { revoked_at: now },
      where: { family_id: familyId, revoked_at: null },
    });
  }

  async revokeRefreshTokenByHash(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      data: { revoked_at: now },
      where: { revoked_at: null, token_hash: tokenHash },
    });
  }

  async findSession(userId: string): Promise<AuthSession | null> {
    const [user, flags] = await this.prisma.$transaction([
      this.prisma.user.findUnique({
        select: userSelect,
        where: { id: userId },
      }),
      this.prisma.featureFlag.findMany({
        select: { is_enabled: true, key: true },
      }),
    ]);
    if (!user) return null;
    return {
      flags: Object.fromEntries(
        flags.map((flag) => [flag.key, flag.is_enabled]),
      ),
      user: toAuthUser(user),
    };
  }

  async upsertDevice(input: UpsertDeviceInput): Promise<void> {
    await this.prisma.userDevice.upsert({
      create: {
        app_version: input.appVersion,
        fcm_token: input.fcmToken,
        id: input.deviceId,
        platform: input.platform ?? "UNKNOWN",
        user_id: input.userId,
      },
      update: {
        app_version: input.appVersion,
        fcm_token: input.fcmToken,
        last_seen_at: new Date(),
        platform: input.platform,
      },
      where: { id: input.deviceId },
    });
  }

  async deleteDevice(deviceId: string, userId: string): Promise<boolean> {
    const deleted = await this.prisma.userDevice.deleteMany({
      where: { id: deviceId, user_id: userId },
    });
    return deleted.count === 1;
  }
}
