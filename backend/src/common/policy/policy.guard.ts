import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  authorizationDeniedError,
  authorizationPolicyRequiredError,
  privateResourceNotFoundError,
} from "../errors/authorization.errors";
import { AuthenticatedRequest } from "../guards/jwt.guard";
import { AbilityFactory, PolicyResourceContext } from "./ability.factory";
import {
  containsPrivateResourcePolicy,
  POLICY_METADATA_KEY,
  PolicyDefinition,
} from "./policy.types";

export interface PolicyRequest extends AuthenticatedRequest {
  policyResource?: PolicyResourceContext;
}

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly ability: AbilityFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<PolicyDefinition>(
      POLICY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy || policy.anyOf.length === 0) {
      throw authorizationPolicyRequiredError();
    }

    const request = context.switchToHttp().getRequest<PolicyRequest>();
    if (
      this.ability.canAny(request.auth, policy.anyOf, request.policyResource)
    ) {
      return true;
    }
    if (containsPrivateResourcePolicy(policy)) {
      throw privateResourceNotFoundError();
    }
    throw authorizationDeniedError();
  }
}
