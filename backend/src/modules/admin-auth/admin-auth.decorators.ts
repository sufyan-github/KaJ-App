import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { AdminRole } from "@prisma/client";

import { AdminActor } from "./admin-auth.types";

export const ADMIN_ROLES_KEY = "kaj.admin.roles";
export const AdminRoles = (...roles: AdminRole[]) =>
  SetMetadata(ADMIN_ROLES_KEY, roles);

/** Every staff role: for routes about the admin's own session only. */
export const ALL_ADMIN_ROLES: readonly AdminRole[] = Object.values(AdminRole);

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminActor | undefined =>
    context.switchToHttp().getRequest<{ admin?: AdminActor }>().admin,
);
