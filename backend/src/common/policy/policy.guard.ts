import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  authorizationDeniedError,
  authorizationPolicyRequiredError,
  privateResourceNotFoundError,
} from "../errors/authorization.errors";
import { AuthenticatedRequest } from "../guards/jwt.guard";
import { AbilityFactory, PolicyResourceContext } from "./ability.factory";
import { PolicyResourceResolver } from "./policy-resource.resolver";
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
    @Optional() private readonly resources?: PolicyResourceResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<PolicyDefinition>(
      POLICY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy || policy.anyOf.length === 0) {
      throw authorizationPolicyRequiredError();
    }

    const request = context.switchToHttp().getRequest<PolicyRequest>();
    if (
      containsPrivateResourcePolicy(policy) &&
      request.policyResource === undefined &&
      this.resources
    ) {
      const resolved = await this.resources.resolve(
        policy.anyOf,
        (request.params ?? {}) as Record<string, string | undefined>,
      );
      // A malformed id: the same 400 the route's ParseUUIDPipe gives.
      if (resolved === undefined)
        throw new BadRequestException("Validation failed (uuid is expected)");
      request.policyResource = resolved;
    }
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
