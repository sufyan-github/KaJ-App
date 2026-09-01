import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminRole } from "@prisma/client";

import { adminSessionInvalidError } from "./admin-auth.errors";
import { AdminAuthService } from "./admin-auth.service";
import { ADMIN_ROLES_KEY } from "./admin-auth.decorators";
import { AdminActor } from "./admin-auth.types";

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AdminAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      admin?: AdminActor;
      headers: { authorization?: string };
    }>();
    const [scheme, token, extra] =
      request.headers.authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token || extra)
      throw adminSessionInvalidError();
    const actor = await this.auth.authenticate(token);
    const required = this.reflector.getAllAndOverride<readonly AdminRole[]>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required?.length && !required.includes(actor.role)) {
      throw adminSessionInvalidError();
    }
    request.admin = actor;
    return true;
  }
}
