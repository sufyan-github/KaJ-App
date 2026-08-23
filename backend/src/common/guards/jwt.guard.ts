import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";

import { accessTokenInvalidError } from "../../modules/auth/auth.errors";
import {
  AccessTokenClaims,
  AuthTokenService,
} from "../../modules/auth/auth-token.service";
import {
  isPublicPolicy,
  POLICY_METADATA_KEY,
  PolicyDefinition,
} from "../policy/policy.types";

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PolicyDefinition>(
      POLICY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy || isPublicPolicy(policy)) return true;

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
