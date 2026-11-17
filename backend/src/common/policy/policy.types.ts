import { BusinessMemberRole, RoleMode } from "@prisma/client";

export const POLICY_METADATA_KEY = "kaj.authorization.policy";

export type PolicyKind =
  | "public"
  | "authenticated"
  | "role"
  | "admin"
  | "job-poster"
  | "assigned-worker"
  | "conversation-participant"
  | "mentor-owner"
  | "business-member";

/** Which record a route parameter names, for ownership rules. */
export type PolicyResourceSource =
  "job" | "assignment" | "application" | "conversation" | "business";

export interface PolicyRule {
  kind: PolicyKind;
  role?: RoleMode;
  /** For ownership rules: the record the route param identifies. */
  source?: PolicyResourceSource;
  /** The route parameter holding that record's id (default "id"). */
  param?: string;
  /** business-member: the member roles allowed (default: any member). */
  businessRoles?: readonly BusinessMemberRole[];
}

interface ResourceOptions {
  source?: PolicyResourceSource;
  param?: string;
}

export interface PolicyDefinition {
  anyOf: readonly PolicyRule[];
}

export const Policies = {
  public: (): PolicyRule => ({ kind: "public" }),
  authenticated: (): PolicyRule => ({ kind: "authenticated" }),
  role: (role: RoleMode): PolicyRule => ({ kind: "role", role }),
  admin: (): PolicyRule => ({ kind: "admin" }),
  /** The poster of the job the route names (job, or via assignment/application). */
  jobPoster: (options: ResourceOptions = {}): PolicyRule => ({
    kind: "job-poster",
    source: options.source ?? "job",
    param: options.param ?? "id",
  }),
  /** The worker of the assignment the route names. */
  assignedWorker: (options: { param?: string } = {}): PolicyRule => ({
    kind: "assigned-worker",
    source: "assignment",
    param: options.param ?? "id",
  }),
  /** The mentor who published the learning opportunity the route names. */
  mentorOwner: (options: { param?: string } = {}): PolicyRule => ({
    kind: "mentor-owner",
    source: "job",
    param: options.param ?? "id",
  }),
  /** An accepted member of the business the route names (optionally by role). */
  businessMember: (
    options: { param?: string; roles?: readonly BusinessMemberRole[] } = {},
  ): PolicyRule => ({
    kind: "business-member",
    source: "business",
    param: options.param ?? "id",
    businessRoles: options.roles,
  }),
  conversationParticipant: (options: { param?: string } = {}): PolicyRule => ({
    kind: "conversation-participant",
    source: "conversation",
    param: options.param ?? "id",
  }),
} as const;

export function isPublicPolicy(policy: PolicyDefinition | undefined): boolean {
  return policy?.anyOf.some((rule) => rule.kind === "public") === true;
}

export function containsPrivateResourcePolicy(
  policy: PolicyDefinition,
): boolean {
  return policy.anyOf.some(
    (rule) =>
      rule.kind === "job-poster" ||
      rule.kind === "assigned-worker" ||
      rule.kind === "conversation-participant" ||
      rule.kind === "mentor-owner" ||
      rule.kind === "business-member",
  );
}
