import "reflect-metadata";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { ADMIN_ROUTE_ROLES } from "../../admin/lib/admin-route-roles";
import { collectAdminRouteRoles } from "./support/admin-routes";

const GENERATED = join(__dirname, "../../admin/lib/admin-route-roles.ts");

function render(routes: ReturnType<typeof collectAdminRouteRoles>): string {
  const lines = routes.map(
    ({ route, roles }) =>
      `  ${JSON.stringify(route)}: [${roles.map((role) => JSON.stringify(role)).join(", ")}],`,
  );
  return [
    "// Generated from the backend's @AdminRoles decorators. Do not edit by hand:",
    "// UPDATE_ADMIN_ROLE_MATRIX=1 corepack pnpm --filter @kaj/backend exec jest test/admin-role-matrix.spec.ts",
    "// then `corepack pnpm format`. backend/test/admin-role-matrix.spec.ts fails",
    "// while this file and the decorators disagree.",
    "",
    'export type AdminRole = "ADMIN" | "MODERATOR" | "SUPPORT" | "FINANCE";',
    "",
    "export const ADMIN_ROUTE_ROLES = {",
    ...lines,
    "} as const satisfies Record<string, readonly AdminRole[]>;",
    "",
    "export type AdminRoute = keyof typeof ADMIN_ROUTE_ROLES;",
    "",
  ].join("\n");
}

/**
 * The console hides what a role cannot use from one matrix
 * (admin/lib/admin-route-roles.ts). It must say exactly what the backend's
 * @AdminRoles decorators say, route by route.
 */
describe("admin console role matrix", () => {
  const routes = collectAdminRouteRoles();

  if (process.env.UPDATE_ADMIN_ROLE_MATRIX === "1")
    it("rewrites the generated matrix", () => {
      writeFileSync(GENERATED, render(routes));
    });

  it("every admin route declares its roles", () => {
    expect(routes.filter((route) => !route.roles.length)).toEqual([]);
  });

  it("matches the backend decorators route by route", () => {
    const fromBackend = Object.fromEntries(
      routes.map(({ route, roles }) => [route, [...roles].sort()]),
    );
    const inConsole = Object.fromEntries(
      Object.entries(
        ADMIN_ROUTE_ROLES as Record<string, readonly string[]>,
      ).map(([route, roles]) => [route, [...roles].sort()]),
    );
    expect(inConsole).toEqual(fromBackend);
  });
});
