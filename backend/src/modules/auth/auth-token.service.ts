import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { CLOCK, Clock } from "../../common/time/clock";
import { AuthUser, NewRefreshToken } from "./auth.repository";
import { parseTtlSeconds } from "./ttl";

export interface AccessTokenClaims {
  activeRole: AuthUser["activeRole"];
  deviceId: string;
  exp: number;
  iat: number;
  isAdmin: boolean;
  roles: AuthUser["roles"];
  sub: string;
  type: "access";
}

export interface RefreshTokenMaterial {
  record: NewRefreshToken;
  token: string;
}

function localOnlySecret(purpose: "access" | "refresh"): string {
  return createHash("sha256")
    .update(`kaj:${purpose}:local-development-only`)
    .digest("hex");
}

@Injectable()
export class AuthTokenService {
  private readonly accessSecret: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshSecret: string;
  private readonly refreshTtlSeconds: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.accessSecret =
      config.get<string>("JWT_ACCESS_SECRET") || localOnlySecret("access");
    this.refreshSecret =
      config.get<string>("JWT_REFRESH_SECRET") || localOnlySecret("refresh");
    this.accessTtlSeconds = parseTtlSeconds(
      config.get<string>("JWT_ACCESS_TTL", "15m"),
    );
    this.refreshTtlSeconds = parseTtlSeconds(
      config.get<string>("JWT_REFRESH_TTL", "30d"),
    );
  }

  async createAccessToken(user: AuthUser, deviceId: string): Promise<string> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1_000);
    const claims: AccessTokenClaims = {
      activeRole: user.activeRole,
      deviceId,
      exp: issuedAt + this.accessTtlSeconds,
      iat: issuedAt,
      isAdmin: user.isAdmin,
      roles: user.roles,
      sub: user.id,
      type: "access",
    };
    return this.jwt.signAsync(claims, {
      algorithm: "HS256",
      secret: this.accessSecret,
    });
  }

  createRefreshToken(
    deviceId: string,
    familyId: string = randomUUID(),
  ): RefreshTokenMaterial {
    const token = randomBytes(48).toString("base64url");
    return {
      record: {
        deviceId,
        expiresAt: new Date(
          this.clock.now().getTime() + this.refreshTtlSeconds * 1_000,
        ),
        familyId,
        tokenHash: this.hashRefreshToken(token),
      },
      token,
    };
  }

  hashRefreshToken(token: string): string {
    return createHmac("sha256", this.refreshSecret).update(token).digest("hex");
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
      algorithms: ["HS256"],
      clockTimestamp: Math.floor(this.clock.now().getTime() / 1_000),
      secret: this.accessSecret,
    });
    if (claims.type !== "access" || !claims.sub || !claims.deviceId) {
      throw new Error("Invalid access-token claims");
    }
    return claims;
  }
}
