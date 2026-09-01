import { RoleMode } from "@prisma/client";

import { activateRoleMode } from "../src/modules/users/role-modes";

describe("role mode activation", () => {
  it("is idempotent for an already active role", () => {
    expect(activateRoleMode([RoleMode.CUSTOMER], RoleMode.CUSTOMER)).toEqual([
      RoleMode.CUSTOMER,
    ]);
  });

  it("preserves the existing role when activating the second mode", () => {
    expect(activateRoleMode([RoleMode.CUSTOMER], RoleMode.WORKER)).toEqual([
      RoleMode.CUSTOMER,
      RoleMode.WORKER,
    ]);
  });
});
