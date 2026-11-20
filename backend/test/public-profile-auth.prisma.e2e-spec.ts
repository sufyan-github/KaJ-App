import { RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R1 / API-6: the worker directory and public profiles need a sign-in, so a
 * blocked person cannot sign out to keep watching someone, and nobody can
 * scrape the directory. Neither the app (signed-out users only see the
 * sign-in screens) nor the landing page reads these routes anonymously.
 */
databaseDescribe("public worker profiles need a sign-in (real HTTP)", () => {
  let api: HttpHarness;
  let worker: Actor;
  let viewer: Actor;

  beforeAll(async () => {
    api = await HttpHarness.start();
    worker = await api.actor([RoleMode.WORKER]);
    viewer = await api.actor([RoleMode.CUSTOMER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("answers 401 without a token", async () => {
    const profile = await api.get(`users/${worker.id}/public`).expect(401);
    expect(profile.body.error.code).toBe("ACCESS_TOKEN_INVALID");
    await api.get("users/workers").expect(401);
  });

  it("still serves signed-in viewers", async () => {
    await api.get(`users/${worker.id}/public`, viewer).expect(200);
    await api.get("users/workers", viewer).expect(200);
  });

  it("keeps a blocked person out even when they sign out", async () => {
    await api.db.userBlock.create({
      data: { blocker_user_id: worker.id, blocked_user_id: viewer.id },
    });
    await api.get(`users/${worker.id}/public`, viewer).expect(404);
    await api.get(`users/${worker.id}/public`).expect(401);
  });
});
