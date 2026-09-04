import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { ModerationLevel, UserStatus } from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { AccountModerationGuard } from "../src/common/guards/account-moderation.guard";
import { AccountModerationReader } from "../src/common/guards/account-moderation.reader";

describe("AccountModerationGuard", () => {
  const findAccount = jest.fn();
  const accounts = { findAccount } as AccountModerationReader;
  const clock: Clock = { now: () => new Date("2026-09-04T16:00:00Z") };
  const guard = new AccountModerationGuard(accounts, clock);

  beforeEach(() => {
    findAccount.mockResolvedValue({
      status: UserStatus.ACTIVE,
      moderation_level: ModerationLevel.NONE,
      restriction_ends_at: null,
      reverification_required: false,
      deleted_at: null,
    });
  });

  it("allows an active account", async () => {
    await expect(
      guard.canActivate(context("POST", "/api/v1/jobs")),
    ).resolves.toBe(true);
  });

  it("allows reads but blocks marketplace writes for a restricted account", async () => {
    findAccount.mockResolvedValue({
      status: UserStatus.ACTIVE,
      moderation_level: ModerationLevel.RESTRICT,
      restriction_ends_at: new Date("2026-09-05T16:00:00Z"),
      reverification_required: false,
      deleted_at: null,
    });
    await expect(
      guard.canActivate(context("GET", "/api/v1/jobs")),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context("POST", "/api/v1/jobs")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("never blocks report or block safety actions", async () => {
    findAccount.mockResolvedValue({
      status: UserStatus.ACTIVE,
      moderation_level: ModerationLevel.RESTRICT,
      restriction_ends_at: null,
      reverification_required: true,
      deleted_at: null,
    });
    await expect(
      guard.canActivate(context("POST", "/api/v1/reports")),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        context(
          "POST",
          "/api/v1/users/018f4f6f-13e8-7d9a-8c2b-6b6a9f62f531/block",
        ),
      ),
    ).resolves.toBe(true);
  });

  it("limits re-verification accounts to safety and verification writes", async () => {
    findAccount.mockResolvedValue({
      status: UserStatus.ACTIVE,
      moderation_level: ModerationLevel.WARN,
      restriction_ends_at: null,
      reverification_required: true,
      deleted_at: null,
    });
    await expect(
      guard.canActivate(context("POST", "/api/v1/jobs/job/applications")),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(context("POST", "/api/v1/verification-requests")),
    ).resolves.toBe(true);
  });

  it("blocks suspended and banned accounts immediately", async () => {
    for (const status of [UserStatus.SUSPENDED, UserStatus.BANNED]) {
      findAccount.mockResolvedValue({
        status,
        moderation_level:
          status === UserStatus.BANNED
            ? ModerationLevel.BAN
            : ModerationLevel.SUSPEND,
        restriction_ends_at: null,
        reverification_required: false,
        deleted_at: null,
      });
      await expect(
        guard.canActivate(context("GET", "/api/v1/jobs")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});

function context(method: string, path: string): ExecutionContext {
  const request = {
    auth: {
      sub: "018f4f6f-13e8-7d9a-8c2b-6b6a9f62f530",
      type: "access",
    },
    method,
    path,
    originalUrl: path,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
