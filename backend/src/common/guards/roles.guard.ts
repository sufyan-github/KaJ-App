import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RoleMode } from "@prisma/client";

import { ROLES_METADATA_KEY } from "../decorators/roles.decorator";
import { authorizationDeniedError } from "../errors/authorization.errors";
import { AuthenticatedRequest } from "./jwt.guard";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly RoleMode[]>(
      ROLES_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !request.auth ||
      !required.some((role) => request.auth?.roles.includes(role))
    ) {
      throw authorizationDeniedError();
    }
    return true;
  }
}
