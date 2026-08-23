import { RoleMode } from "@prisma/client";

export const POLICY_METADATA_KEY = "kaj.authorization.policy";

export type PolicyKind =
  | "public"
  | "authenticated"
  | "role"
  | "admin"
  | "job-poster"
  | "assigned-worker"
  | "conversation-participant";

export interface PolicyRule {
  kind: PolicyKind;
  role?: RoleMode;
}

export interface PolicyDefinition {
  anyOf: readonly PolicyRule[];
}

export const Policies = {
  public: (): PolicyRule => ({ kind: "public" }),
  authenticated: (): PolicyRule => ({ kind: "authenticated" }),
  role: (role: RoleMode): PolicyRule => ({ kind: "role", role }),
  admin: (): PolicyRule => ({ kind: "admin" }),
  jobPoster: (): PolicyRule => ({ kind: "job-poster" }),
  assignedWorker: (): PolicyRule => ({ kind: "assigned-worker" }),
  conversationParticipant: (): PolicyRule => ({
    kind: "conversation-participant",
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
      rule.kind === "conversation-participant",
  );
}
