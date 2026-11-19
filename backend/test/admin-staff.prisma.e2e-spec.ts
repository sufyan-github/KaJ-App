import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { AdminRole } from "@prisma/client";

import { AUTH_RATE_LIMITER } from "../src/modules/auth/auth-rate-limiter";
import { totpCode } from "../src/modules/admin-auth/admin-auth.primitives";
import { adminSession } from "./support/admin-session";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

const REASON = "Staff change requested by the operations lead.";

/** Staff management (R5): list, invite, change role, deactivate, reactivate. */
databaseDescribe("admin staff management (real HTTP)", () => {
  let api: HttpHarness;
  let admin: Actor & { email: string };
  const invited: string[] = [];

  beforeAll(async () => {
    // Sign-in limits are tested elsewhere; here every sign-in is from
    // 127.0.0.1 and repeated runs would hit the per-address limit.
    api = await HttpHarness.start((builder) =>
      builder
        .overrideProvider(AUTH_RATE_LIMITER)
        .useValue({ consume: async () => ({ allowed: true }) }),
    );
    admin = await adminSession(api, AdminRole.ADMIN);
  });

  afterAll(async () => {
    const ids = [...invited, ...api.userIds];
    await api.db.auditLog.deleteMany({
      where: {
        OR: [{ actor_user_id: { in: ids } }, { entity_id: { in: ids } }],
      },
    });
    await api.db.user.deleteMany({ where: { id: { in: ids } } });
    await api?.close();
  });

  async function signIn(email: string, password: string, secret: string) {
    const login = await api.post("admin/auth/login", undefined, {
      email,
      password,
    });
    if (login.status !== 201) return login;
    // A fresh counter: the invite marks no counter as used.
    const code = totpCode(secret, Math.floor(Date.now() / 30_000));
    return api.post("admin/auth/totp", undefined, {
      challengeToken: login.body.data.challengeToken,
      code,
    });
  }

  async function invite(role: AdminRole) {
    const email = `invited-${randomUUID()}@test.invalid`;
    const response = await api.post("admin/staff", admin, {
      email,
      displayName: "Invited operator",
      role,
      reason: REASON,
    });
    expect(response.status).toBe(201);
    invited.push(response.body.data.staff.userId);
    return { email, ...response.body.data } as {
      email: string;
      staff: { userId: string; role: string; active: boolean };
      credentials: {
        temporaryPassword: string;
        totpSecret: string;
        otpauthUri: string;
      };
    };
  }

  it("invites a staff member who can then sign in with the one-time details", async () => {
    const result = await invite(AdminRole.SUPPORT);
    expect(result.staff).toMatchObject({ role: "SUPPORT", active: true });
    expect(result.credentials.otpauthUri).toContain(
      `secret=${result.credentials.totpSecret}`,
    );
    const session = await signIn(
      result.email,
      result.credentials.temporaryPassword,
      result.credentials.totpSecret,
    );
    expect(session.status).toBe(201);
    expect(session.body.data.user.role).toBe("SUPPORT");

    // Neither secret is stored in clear or written to the audit log.
    const audit = await api.db.auditLog.findFirstOrThrow({
      where: { action: "ADMIN_STAFF_INVITED", entity_id: result.staff.userId },
    });
    const logged = JSON.stringify(audit.after_json);
    expect(logged).not.toContain(result.credentials.temporaryPassword);
    expect(logged).not.toContain(result.credentials.totpSecret);
    expect(logged).toContain(REASON);
  });

  it("refuses an email that is already in use", async () => {
    const response = await api.post("admin/staff", admin, {
      email: admin.email,
      displayName: "Duplicate",
      role: AdminRole.SUPPORT,
      reason: REASON,
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("STAFF_EMAIL_IN_USE");
  });

  it("lists staff with role and state", async () => {
    const result = await invite(AdminRole.FINANCE);
    const response = await api.get("admin/staff", admin);
    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: result.staff.userId,
          role: "FINANCE",
          active: true,
        }),
      ]),
    );
  });

  it("changes a role, and the next request runs with the new role", async () => {
    const result = await invite(AdminRole.MODERATOR);
    const session = await signIn(
      result.email,
      result.credentials.temporaryPassword,
      result.credentials.totpSecret,
    );
    const token = session.body.data.sessionToken as string | undefined;
    const changed = await api.put(
      `admin/staff/${result.staff.userId}/role`,
      admin,
      { role: AdminRole.FINANCE, reason: REASON },
    );
    expect(changed.status).toBe(200);
    expect(changed.body.data.role).toBe("FINANCE");
    if (token) {
      const config = await api.get("admin/config", {
        id: result.staff.userId,
        token,
      });
      expect(config.status).toBe(200);
    }
  });

  it("refuses to change the actor's own role or access", async () => {
    for (const response of [
      await api.put(`admin/staff/${admin.id}/role`, admin, {
        role: AdminRole.SUPPORT,
        reason: REASON,
      }),
      await api.post(`admin/staff/${admin.id}/deactivate`, admin, {
        reason: REASON,
      }),
    ]) {
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("STAFF_SELF_CHANGE");
    }
  });

  it("deactivating ends sessions and sign-in; reactivating issues new details", async () => {
    const result = await invite(AdminRole.SUPPORT);
    const live = await adminSession(api, AdminRole.SUPPORT);
    // Use the invited account through a session of its own.
    const session = await signIn(
      result.email,
      result.credentials.temporaryPassword,
      result.credentials.totpSecret,
    );
    expect(session.status).toBe(201);

    const deactivated = await api.post(
      `admin/staff/${result.staff.userId}/deactivate`,
      admin,
      { reason: REASON },
    );
    expect(deactivated.status).toBe(201);
    expect(deactivated.body.data.active).toBe(false);
    const sessions = await api.db.adminSession.findMany({
      where: { user_id: result.staff.userId },
    });
    expect(sessions.every((row) => row.revoked_at)).toBe(true);
    const refused = await signIn(
      result.email,
      result.credentials.temporaryPassword,
      result.credentials.totpSecret,
    );
    expect(refused.status).toBe(401);
    // Someone else's session is untouched.
    expect((await api.get("admin/dashboard", live)).status).toBe(200);

    const again = await api.post(
      `admin/staff/${result.staff.userId}/reactivate`,
      admin,
      { reason: REASON },
    );
    expect(again.status).toBe(201);
    const fresh = again.body.data.credentials;
    expect(fresh.temporaryPassword).not.toBe(
      result.credentials.temporaryPassword,
    );
    expect(
      (
        await signIn(
          result.email,
          result.credentials.temporaryPassword,
          result.credentials.totpSecret,
        )
      ).status,
    ).toBe(401);
    expect(
      (await signIn(result.email, fresh.temporaryPassword, fresh.totpSecret))
        .status,
    ).toBe(201);
  });

  it("two ADMINs demoting each other at once leave one ADMIN", async () => {
    const first = await adminSession(api, AdminRole.ADMIN);
    const second = await adminSession(api, AdminRole.ADMIN);
    // For this check they are the only active ADMINs.
    const parked = await api.db.user.findMany({
      where: {
        is_admin: true,
        admin_credential: { role: AdminRole.ADMIN },
        id: { notIn: [first.id, second.id] },
      },
      select: { id: true },
    });
    const parkedIds = parked.map((row) => row.id);
    await api.db.user.updateMany({
      where: { id: { in: parkedIds } },
      data: { is_admin: false },
    });
    try {
      const results = await Promise.all([
        api.put(`admin/staff/${second.id}/role`, first, {
          role: AdminRole.SUPPORT,
          reason: REASON,
        }),
        api.put(`admin/staff/${first.id}/role`, second, {
          role: AdminRole.SUPPORT,
          reason: REASON,
        }),
      ]);
      const outcomes = results
        .map((r) => `${r.status} ${r.body?.error?.code ?? ""}`.trim())
        .sort();
      // One wins; the other is refused, by the last-ADMIN check or, if the
      // winner committed before its guard ran, by its new role.
      expect(outcomes[0]).toBe("200");
      expect(outcomes[1]).toMatch(
        /^(409 STAFF_LAST_ADMIN|403 ADMIN_ROLE_FORBIDDEN)$/u,
      );
      const admins = await api.db.adminCredential.count({
        where: {
          user_id: { in: [first.id, second.id] },
          role: AdminRole.ADMIN,
        },
      });
      expect(admins).toBe(1);
    } finally {
      await api.db.user.updateMany({
        where: { id: { in: parkedIds } },
        data: { is_admin: true },
      });
    }
  });

  it("only ADMIN reaches staff routes", async () => {
    for (const role of [
      AdminRole.MODERATOR,
      AdminRole.SUPPORT,
      AdminRole.FINANCE,
    ]) {
      const other = await adminSession(api, role);
      const response = await api.get("admin/staff", other);
      expect(response.status).toBe(403);
    }
  });
});
