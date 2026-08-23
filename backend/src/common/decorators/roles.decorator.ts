import { SetMetadata } from "@nestjs/common";
import { RoleMode } from "@prisma/client";

export const ROLES_METADATA_KEY = "kaj.authorization.roles";

export const Roles = (...roles: readonly RoleMode[]): MethodDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
