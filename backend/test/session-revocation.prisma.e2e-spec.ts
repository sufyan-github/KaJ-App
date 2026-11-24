import { randomUUID } from "node:crypto";
import { AdminRole, RoleMode } from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R7 B9 (E2.10): resetting someone's sessions ends their access tokens at
 * once, not when the 15-minute token expires.
 */
databaseDescribe("session reset revokes access tokens (real HTTP)", () => {
  let api: HttpHarness;
  let ops: AdminOpsService;
  const context = { ip: "127.0.0.1", ua: "b9-test" };

  beforeAll(async () => {
    api = await HttpHarness.start();
    ops = api.app.get(AdminOpsService);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses the old access token right after an admin session reset", async () => {
    const user = await api.actor([RoleMode.WORKER]);
    await api.get("profiles/me", user).expect(200);
    const staff = await api.actor([RoleMode.CUSTOMER]);
    await ops.resetUserSessions(
      user.id,
      "Lost phone reported by the owner.",
      {
        userId: staff.id,
        email: "support@kaj.test",
        role: AdminRole.SUPPORT,
        sessionId: randomUUID(),
      },
      context,
    );
    await api.get("profiles/me", user).expect(401);
    // Signing in again gives a token that works.
    const fresh = await api.tokenFor(user.id, [RoleMode.WORKER]);
    await api.get("profiles/me", fresh).expect(200);
  });
});
