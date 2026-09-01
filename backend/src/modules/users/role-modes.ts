import { RoleMode } from "@prisma/client";

export function activateRoleMode(
  current: readonly RoleMode[],
  requested: RoleMode,
): RoleMode[] {
  return current.includes(requested) ? [...current] : [...current, requested];
}
