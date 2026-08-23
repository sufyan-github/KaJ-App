import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { AccessTokenClaims } from "../../modules/auth/auth-token.service";
import { AuthenticatedRequest } from "../guards/jwt.guard";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth)
      throw new Error("CurrentUser requires an authenticated policy");
    return request.auth;
  },
);
