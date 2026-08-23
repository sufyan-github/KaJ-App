import { Injectable } from "@nestjs/common";

import { AccessTokenClaims } from "../../modules/auth/auth-token.service";
import { PolicyRule } from "./policy.types";

export interface PolicyResourceContext {
  assignedWorkerId?: string;
  conversationParticipantIds?: readonly string[];
  jobPosterId?: string;
}

@Injectable()
export class AbilityFactory {
  canAny(
    actor: AccessTokenClaims | undefined,
    rules: readonly PolicyRule[],
    resource?: PolicyResourceContext,
  ): boolean {
    return (
      rules.length > 0 && rules.some((rule) => this.can(actor, rule, resource))
    );
  }

  private can(
    actor: AccessTokenClaims | undefined,
    rule: PolicyRule,
    resource?: PolicyResourceContext,
  ): boolean {
    switch (rule.kind) {
      case "public":
        return true;
      case "authenticated":
        return actor !== undefined;
      case "role":
        return (
          actor !== undefined &&
          rule.role !== undefined &&
          actor.roles.includes(rule.role)
        );
      case "admin":
        return actor?.isAdmin === true;
      case "job-poster":
        return actor !== undefined && resource?.jobPosterId === actor.sub;
      case "assigned-worker":
        return actor !== undefined && resource?.assignedWorkerId === actor.sub;
      case "conversation-participant":
        return (
          actor !== undefined &&
          resource?.conversationParticipantIds?.includes(actor.sub) === true
        );
    }
  }
}
