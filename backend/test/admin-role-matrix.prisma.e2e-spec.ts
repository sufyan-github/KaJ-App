import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { AdminRole } from "@prisma/client";
import request from "supertest";

import { adminSession } from "./support/admin-session";
import { collectAdminRouteRoles } from "./support/admin-routes";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

const ROLES = Object.values(AdminRole);

/** A harmless concrete path: ids that match nothing, keys that do not exist. */
function concrete(path: string): string {
  return path
    .replace(/:targetType/gu, "GROUP")
    .replace(/:(key|featureKey)/gu, "r5-role-matrix-missing")
    .replace(/:\w+/gu, () => randomUUID());
}

/**
 * Every /admin route × every admin role, over real HTTP: a role the
 * decorator leaves out gets 403 ADMIN_ROLE_FORBIDDEN, a role it lists gets
 * past the guard, and no session gets 401. Writes send `{}`, which every
 * allowed route refuses (validation) or finds nothing for, so nothing changes.
 */
databaseDescribe("admin routes × roles over HTTP", () => {
  let api: HttpHarness;
  const sessions = {} as Record<AdminRole, Actor>;
  const routes = collectAdminRouteRoles();

  beforeAll(async () => {
    api = await HttpHarness.start();
    for (const role of ROLES) sessions[role] = await adminSession(api, role);
  });

  afterAll(async () => {
    await api.db.auditLog.deleteMany({
      where: {
        actor_user_id: { in: Object.values(sessions).map((s) => s.id) },
      },
    });
    await api.db.user.deleteMany({
      where: { id: { in: Object.values(sessions).map((s) => s.id) } },
    });
    await api?.close();
  });

  function call(method: string, path: string, as?: Actor) {
    const agent = request(api.app.getHttpServer());
    const url = `/api/v1/admin/${path}`;
    const base =
      method === "GET"
        ? agent.get(url)
        : method === "PUT"
          ? agent.put(url).send({})
          : method === "PATCH"
            ? agent.patch(url).send({})
            : method === "DELETE"
              ? agent.delete(url)
              : agent.post(url).send({});
    return as ? base.auth(as.token, { type: "bearer" }) : base;
  }

  it("covers the routes this console uses", () => {
    const names = routes.map((route) => route.route);
    for (const expected of [
      "GET staff",
      "POST staff",
      "GET notifications/campaigns",
      "POST notifications/campaign/send",
    ])
      expect(names).toContain(expected);
  });

  it.each(collectAdminRouteRoles().map((route) => [route.route, route.roles]))(
    "%s allows exactly %j",
    async (route, allowed) => {
      const [method, path] = (route as string).split(" ") as [string, string];
      const target = concrete(path);
      const anonymous = await call(method, target);
      expect(anonymous.status).toBe(401);
      for (const role of ROLES) {
        const response = await call(method, target, sessions[role]);
        const outcome = `${role} → ${response.status} ${response.body?.error?.code ?? ""}`;
        if ((allowed as string[]).includes(role)) {
          expect(outcome).not.toMatch(/ → (401|403) /u);
          expect(response.status).toBeLessThan(500);
        } else {
          expect(outcome).toBe(`${role} → 403 ADMIN_ROLE_FORBIDDEN`);
        }
      }
    },
  );
});
