import { randomUUID } from "node:crypto";
import { AdminRole, ModerationLevel, RoleMode } from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { AdminActor } from "../src/modules/admin-auth/admin-auth.types";
import { ModerationService } from "../src/modules/moderation/moderation.service";
import { HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R1 admin roles (A3, A9, A10, A8): only an ADMIN acts on a staff account,
 * and config values are checked before they are saved.
 */
databaseDescribe("staff accounts and config (PostgreSQL)", () => {
  let api: HttpHarness;
  let moderation: ModerationService;
  let ops: AdminOpsService;
  const context = { ip: "127.0.0.1", ua: "admin-staff-test" };

  const staff = async (role: AdminRole): Promise<AdminActor> => {
    const user = await api.actor([RoleMode.CUSTOMER]);
    await api.db.adminCredential.create({
      data: {
        user_id: user.id,
        role,
        totp_secret_ciphertext: "test-only-not-a-secret",
      },
    });
    return {
      userId: user.id,
      email: `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@kaj.test`,
      role,
      sessionId: randomUUID(),
    };
  };
  const forbidden = expect.objectContaining({
    descriptor: expect.objectContaining({ code: "ADMIN_ROLE_FORBIDDEN" }),
  });
  const warn = {
    action: ModerationLevel.WARN,
    reason: "Testing who may act on staff accounts.",
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    moderation = api.app.get(ModerationService);
    ops = api.app.get(AdminOpsService);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses a MODERATOR moderating, restoring or reactivating an ADMIN", async () => {
    const moderator = await staff(AdminRole.MODERATOR);
    const admin = await staff(AdminRole.ADMIN);
    await expect(
      moderation.moderateUser(admin.userId, warn as never, moderator, context),
    ).rejects.toEqual(forbidden);
    await expect(
      moderation.restoreUser(
        admin.userId,
        "Testing who may restore staff.",
        moderator,
        context,
      ),
    ).rejects.toEqual(forbidden);
    await expect(
      ops.userAction(
        admin.userId,
        { status: "ACTIVE", reason: "Testing who may reactivate staff." },
        moderator,
        context,
      ),
    ).rejects.toEqual(forbidden);
    const row = await api.db.user.findUniqueOrThrow({
      where: { id: admin.userId },
    });
    expect(row.moderation_level).toBe(ModerationLevel.NONE);
  });

  it("refuses SUPPORT resetting a staff member's sessions", async () => {
    const support = await staff(AdminRole.SUPPORT);
    const finance = await staff(AdminRole.FINANCE);
    await expect(
      ops.resetUserSessions(
        finance.userId,
        "Testing who may reset staff sessions.",
        support,
        context,
      ),
    ).rejects.toEqual(forbidden);
  });

  it("still lets a MODERATOR act on an ordinary account, and an ADMIN on staff", async () => {
    const moderator = await staff(AdminRole.MODERATOR);
    const admin = await staff(AdminRole.ADMIN);
    const ordinary = await api.actor([RoleMode.WORKER]);
    await moderation.moderateUser(
      ordinary.id,
      warn as never,
      moderator,
      context,
    );
    await moderation.moderateUser(
      moderator.userId,
      warn as never,
      admin,
      context,
    );
    expect(
      (
        await api.db.user.findUniqueOrThrow({
          where: { id: moderator.userId },
        })
      ).moderation_level,
    ).toBe(ModerationLevel.WARN);
  });

  it("refuses a config value that does not fit its key", async () => {
    const admin = await staff(AdminRole.ADMIN);
    const before = await api.db.configSetting.findUniqueOrThrow({
      where: { key: "assignment.settings" },
    });
    await expect(
      ops.updateConfig(
        "assignment.settings",
        {
          value: { confirmWindowMinutes: "soon" },
          confirm: true,
          reason: "Testing config validation.",
        } as never,
        admin,
        context,
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        descriptor: expect.objectContaining({ code: "CONFIG_INVALID" }),
      }),
    );
    const after = await api.db.configSetting.findUniqueOrThrow({
      where: { key: "assignment.settings" },
    });
    expect(after.value_json).toEqual(before.value_json);
  });
});
