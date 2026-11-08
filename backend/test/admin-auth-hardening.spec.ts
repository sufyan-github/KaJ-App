import { ExecutionContext, HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";

import { RateLimitException } from "../src/common/errors/rate-limit.exception";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AdminAuthService } from "../src/modules/admin-auth/admin-auth.service";
import { AdminSessionGuard } from "../src/modules/admin-auth/admin-session.guard";
import { AuthRateLimiter } from "../src/modules/auth/auth-rate-limiter";

const context = { ip: "203.0.113.5", ua: "test" };

describe("admin authentication hardening", () => {
  describe("role mismatch", () => {
    function guardFor(role: AdminRole, required: AdminRole[]) {
      const reflector = {
        getAllAndOverride: () => required,
      } as unknown as Reflector;
      const auth = {
        authenticate: jest.fn().mockResolvedValue({ role, userId: "admin" }),
      } as unknown as AdminAuthService;
      return new AdminSessionGuard(reflector, auth);
    }
    function http(): ExecutionContext {
      return {
        getClass: () => Object,
        getHandler: () => () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: "Bearer session-token" },
          }),
        }),
      } as unknown as ExecutionContext;
    }

    it("answers 403 (stay signed in) when the role does not cover the route", async () => {
      const error = await guardFor(AdminRole.SUPPORT, [AdminRole.ADMIN])
        .canActivate(http())
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(403);
    });

    it("lets a permitted role through", async () => {
      await expect(
        guardFor(AdminRole.ADMIN, [AdminRole.ADMIN]).canActivate(http()),
      ).resolves.toBe(true);
    });
  });

  describe("login rate limit", () => {
    it("refuses before checking the password once the limit is reached", async () => {
      const findUnique = jest.fn();
      const limiter: AuthRateLimiter = {
        consume: jest
          .fn()
          .mockResolvedValue({ allowed: false, retryAfterSeconds: 600 }),
      };
      const service = new AdminAuthService(
        { user: { findUnique } } as unknown as PrismaService,
        new ConfigService({}),
        limiter,
      );
      const error = await service
        .login("Admin@Example.org", "guess", context)
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(RateLimitException);
      expect((error as RateLimitException).retryAfterSeconds).toBe(600);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe("TOTP attempts", () => {
    it("reserves an attempt atomically and refuses once none are left", async () => {
      const updateMany = jest.fn().mockResolvedValue({ count: 0 });
      const prisma = {
        adminLoginChallenge: {
          findUnique: jest.fn().mockResolvedValue({
            id: "challenge",
            consumed_at: null,
            expires_at: new Date(Date.now() + 60_000),
            attempts: 4,
            user_id: "admin",
            user: {
              is_admin: true,
              status: "ACTIVE",
              admin_credential: { totp_secret_ciphertext: "unused" },
            },
          }),
          updateMany,
        },
      } as unknown as PrismaService;
      const service = new AdminAuthService(prisma, new ConfigService({}));
      const error = await service
        .verifyTotp("challenge-token", "123456", context)
        .catch((caught: unknown) => caught);
      expect((error as HttpException).getStatus()).toBe(401);
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: "challenge",
          consumed_at: null,
          attempts: { lt: 5 },
        },
        data: { attempts: { increment: 1 } },
      });
    });
  });
});
