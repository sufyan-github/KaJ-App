import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { AccessTokenClaims } from "./auth-token.service";
import { AuthenticatedRequest } from "./access-token.guard";

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth)
      throw new Error("CurrentAuth used without AccessTokenGuard");
    return request.auth;
  },
);
