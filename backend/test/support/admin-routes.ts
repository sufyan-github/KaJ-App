import { readdirSync } from "node:fs";
import { join } from "node:path";

import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";

import { ADMIN_ROLES_KEY } from "../../src/modules/admin-auth/admin-auth.decorators";

export interface AdminRouteRoles {
  /** "GET users", "POST users/:id/moderation": method + path under /admin/. */
  route: string;
  /** From @AdminRoles on the handler, else on the class; [] = none declared. */
  roles: string[];
}

const MODULES = join(__dirname, "../../src/modules");

function controllerFiles(): string[] {
  return readdirSync(MODULES, { recursive: true, encoding: "utf8" })
    .filter((file) => /admin.*\.controller\.ts$/u.test(file))
    .map((file) => join(MODULES, file))
    .sort();
}

function joinPath(...parts: Array<string | undefined>): string {
  return parts
    .flatMap((part) => (part ?? "").split("/"))
    .filter(Boolean)
    .join("/");
}

/**
 * Every route under /admin (except admin/auth/*, the sign-in flow) with the
 * roles its @AdminRoles decorator allows, read from Nest's route metadata.
 */
export function collectAdminRouteRoles(): AdminRouteRoles[] {
  const routes: AdminRouteRoles[] = [];
  for (const file of controllerFiles()) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;
    for (const candidate of Object.values(exported)) {
      if (typeof candidate !== "function") continue;
      const base: unknown = Reflect.getMetadata(PATH_METADATA, candidate);
      if (typeof base !== "string" || !joinPath(base).startsWith("admin"))
        continue;
      const classRoles: string[] | undefined = Reflect.getMetadata(
        ADMIN_ROLES_KEY,
        candidate,
      );
      const prototype = (candidate as { prototype: object }).prototype;
      for (const name of Object.getOwnPropertyNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[name];
        if (name === "constructor" || typeof handler !== "function") continue;
        const method: RequestMethod | undefined = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        );
        if (method === undefined) continue;
        const paths: unknown = Reflect.getMetadata(PATH_METADATA, handler);
        for (const path of Array.isArray(paths) ? paths : [paths]) {
          const full = joinPath(base, String(path ?? "")).replace(
            /^admin\/?/u,
            "",
          );
          if (full.startsWith("auth/") || full === "auth") continue;
          const roles: string[] | undefined =
            Reflect.getMetadata(ADMIN_ROLES_KEY, handler) ?? classRoles;
          routes.push({
            route: `${RequestMethod[method]} ${full}`,
            roles: [...(roles ?? [])],
          });
        }
      }
    }
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route));
}
