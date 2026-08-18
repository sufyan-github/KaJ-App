import { DevicePlatform, RoleMode, UserStatus } from "@prisma/client";

export const AUTH_REPOSITORY = Symbol("AUTH_REPOSITORY");

export interface AuthUser {
  activeRole: RoleMode;
  id: string;
  isAdmin: boolean;
  phoneE164: string;
  roles: RoleMode[];
  status: UserStatus;
}

export interface AuthSession {
  flags: Record<string, boolean>;
  user: AuthUser;
}

export interface StoredOtpChallenge {
  attempts: number;
  codeHash: string;
  consumedAt: Date | null;
  expiresAt: Date;
  id: string;
  phoneE164: string;
}

export interface NewRefreshToken {
  deviceId: string;
  expiresAt: Date;
  familyId: string;
  tokenHash: string;
}

export interface StoredRefreshToken extends NewRefreshToken {
  id: string;
  revokedAt: Date | null;
  user: AuthUser;
}

export interface CreateOtpChallengeInput {
  codeHash: string;
  expiresAt: Date;
  phoneE164: string;
}

export interface ConsumeChallengeInput {
  challengeId: string;
  expectedAttempts: number;
  now: Date;
  phoneE164: string;
  refreshToken: NewRefreshToken;
}

export interface RotateRefreshTokenInput {
  currentTokenId: string;
  nextToken: NewRefreshToken;
  now: Date;
}

export interface UpsertDeviceInput {
  appVersion?: string;
  deviceId: string;
  fcmToken?: string;
  platform?: DevicePlatform;
  userId: string;
}

export interface AuthRepository {
  consumeChallengeAndCreateSession(
    input: ConsumeChallengeInput,
  ): Promise<{ isNewUser: boolean; user: AuthUser } | null>;
  createOtpChallenge(input: CreateOtpChallengeInput): Promise<{ id: string }>;
  deleteDevice(deviceId: string, userId: string): Promise<boolean>;
  findOtpChallenge(id: string): Promise<StoredOtpChallenge | null>;
  findRefreshTokenByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  findSession(userId: string): Promise<AuthSession | null>;
  incrementOtpAttempts(id: string, maxAttempts: number): Promise<boolean>;
  revokeRefreshFamily(familyId: string, now: Date): Promise<void>;
  revokeRefreshTokenByHash(tokenHash: string, now: Date): Promise<void>;
  rotateRefreshToken(input: RotateRefreshTokenInput): Promise<boolean>;
  upsertDevice(input: UpsertDeviceInput): Promise<void>;
}
