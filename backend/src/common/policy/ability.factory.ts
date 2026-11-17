import { Injectable } from "@nestjs/common";

import { AccessTokenClaims } from "../../modules/auth/auth-token.service";
import { PolicyRule } from "./policy.types";

export interface PolicyResourceContext {
  assignedWorkerId?: string;
  conversationParticipantIds?: readonly string[];
  jobPosterId?: string;
  /** The job's opportunity type (WORK, TRAINING, APPRENTICESHIP). */
  opportunityType?: string;
  /** Accepted members of the business the route names, with their role. */
  businessMembers?: ReadonlyArray<{ userId: string; role: string }>;
  /** Requester and recipient of a collaboration request. */
  collaborationParticipantIds?: readonly string[];
  /** The owner of an idea. */
  ideaOwnerId?: string;
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
      case "mentor-owner":
        return (
          actor !== undefined &&
          resource?.jobPosterId === actor.sub &&
          resource.opportunityType !== undefined &&
          resource.opportunityType !== "WORK"
        );
      case "business-member":
        return (
          actor !== undefined &&
          resource?.businessMembers?.some(
            (member) =>
              member.userId === actor.sub &&
              (!rule.businessRoles ||
                rule.businessRoles.some((role) => role === member.role)),
          ) === true
        );
      case "collaboration-participant":
        return (
          actor !== undefined &&
          resource?.collaborationParticipantIds?.includes(actor.sub) === true
        );
      case "idea-owner":
        return actor !== undefined && resource?.ideaOwnerId === actor.sub;
      case "conversation-participant":
        return (
          actor !== undefined &&
          resource?.conversationParticipantIds?.includes(actor.sub) === true
        );
    }
  }
}
