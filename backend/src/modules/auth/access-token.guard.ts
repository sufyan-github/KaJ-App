import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";

import { accessTokenInvalidError } from "./auth.errors";
import { AccessTokenClaims, AuthTokenService } from "./auth-token.service";

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token, extra] =
      request.headers.authorization?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token || extra) throw accessTokenInvalidError();

    try {
      request.auth = await this.tokens.verifyAccessToken(token);
      return true;
    } catch {
      throw accessTokenInvalidError();
    }
  }
}
