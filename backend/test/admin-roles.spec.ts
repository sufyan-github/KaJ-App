import "reflect-metadata";
import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { AdminAuthController } from "../src/modules/admin-auth/admin-auth.controller";
import { ADMIN_ROLES_KEY } from "../src/modules/admin-auth/admin-auth.decorators";
import { AdminSessionGuard } from "../src/modules/admin-auth/admin-session.guard";
import { AdminOpsController } from "../src/modules/admin-ops/admin-ops.controller";
import { validateConfigValue } from "../src/modules/admin-ops/config-rules";
import { ApplicationActionDto } from "../src/modules/admin-ops/dto/admin-ops.dto";
import { AttendanceAdminController } from "../src/modules/attendance/attendance-admin.controller";

const rolesOf = (handler: unknown) =>
  Reflect.getMetadata(ADMIN_ROLES_KEY, handler as object) as
    AdminRole[] | undefined;

/** R1 admin roles (A1, A2, A8, A13, default-deny). */
describe("admin roles", () => {
  describe("AdminSessionGuard", () => {
    const run = async (role: AdminRole, handler: () => void) => {
      const guard = new AdminSessionGuard(new Reflector(), {
        authenticate: async () => ({
          email: "staff@kaj.test",
          role,
          sessionId: "session",
          userId: "user",
        }),
      } as never);
      const context = {
        getHandler: () => handler,
        getClass: () => class Plain {},
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: "Bearer token" } }),
        }),
      } as unknown as ExecutionContext;
      return guard.canActivate(context);
    };

    it("denies a route that names no admin roles, even to an ADMIN", async () => {
      const unmarked = () => undefined;
      await expect(run(AdminRole.ADMIN, unmarked)).rejects.toMatchObject({
        descriptor: expect.objectContaining({ code: "ADMIN_ROLE_FORBIDDEN" }),
      });
    });

    it("allows a listed role and refuses others", async () => {
      const marked = () => undefined;
      Reflect.defineMetadata(ADMIN_ROLES_KEY, [AdminRole.FINANCE], marked);
      await expect(run(AdminRole.FINANCE, marked)).resolves.toBe(true);
      await expect(run(AdminRole.SUPPORT, marked)).rejects.toBeDefined();
    });
  });

  it("keeps the admin session routes open to every staff role", () => {
    for (const handler of [
      AdminAuthController.prototype.session,
      AdminAuthController.prototype.logout,
    ])
      expect(rolesOf(handler)).toEqual(
        expect.arrayContaining(Object.values(AdminRole)),
      );
  });

  it("keeps SUPPORT off the repair tools (A1, A2, A13)", () => {
    for (const handler of [
      AdminOpsController.prototype.unstick,
      AdminOpsController.prototype.transition,
      AttendanceAdminController.prototype.override,
      AttendanceAdminController.prototype.checkoutOverride,
    ]) {
      expect(rolesOf(handler)).toBeDefined();
      expect(rolesOf(handler)).not.toContain(AdminRole.SUPPORT);
    }
  });

  it("lets unstick only put an application back to PENDING (A1)", async () => {
    const check = (status: string) =>
      validate(
        plainToInstance(ApplicationActionDto, {
          status,
          reason: "Stuck after a network error.",
        }),
      );
    expect(await check("PENDING")).toHaveLength(0);
    for (const status of ["ACCEPTED", "WITHDRAWN", "SHORTLISTED"])
      expect(await check(status)).not.toHaveLength(0);
  });

  describe("config values are checked per key (A8)", () => {
    it.each([
      [
        "platform.fees",
        {
          feeBps: 800,
          minFeePoisha: 0,
          maxFeePoisha: null,
          payer: "worker",
          currency: "BDT",
        },
      ],
      [
        "assignment.settings",
        { confirmWindowMinutes: 120, autoConfirmHours: 48 },
      ],
      [
        "matching.weights",
        {
          skill: 0.3,
          location: 0.15,
          availability: 0.15,
          budget: 0.1,
          experience: 0.1,
          rating: 0.1,
          reliability: 0.1,
        },
      ],
    ])("accepts a valid %s", (key, value) => {
      expect(validateConfigValue(key, value)).toEqual([]);
    });

    it.each([
      ["platform.fees", { feeBps: -5, payer: "everyone" }],
      [
        "platform.fees",
        {
          feeBps: 20000,
          minFeePoisha: 0,
          maxFeePoisha: null,
          payer: "worker",
          currency: "BDT",
        },
      ],
      ["assignment.settings", { confirmWindowMinutes: "soon" }],
      ["cancellation.policy", { tiers: [] }],
      ["attendance.settings", { geofenceRadiusM: 300, extra: true }],
      ["matching.weights", { skill: 0, location: 0 }],
      ["unknown.key", { anything: 1 }],
    ])("refuses an invalid %s", (key, value) => {
      expect(validateConfigValue(key, value)).not.toEqual([]);
    });
  });
});
