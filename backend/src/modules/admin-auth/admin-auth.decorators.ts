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

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AdminActor | undefined =>
    context.switchToHttp().getRequest<{ admin?: AdminActor }>().admin,
);
