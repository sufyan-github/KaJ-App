import { randomUUID } from "node:crypto";
import { RoleMode, SkillLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * A block keeps two people apart on every surface, whoever created it:
 * feed, job detail, suggestions, applications, accept, booking, starting a
 * conversation, the public directory and profile, and availability slots.
 */
databaseDescribe("blocks are enforced on every surface (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let blocked: Actor;
  let other: Actor;
  let jobId: string;
  let skillId: string;
  let categoryId: string;
  let locationId: string;
  let blockedApplicationId: string;
  const slot = futureSlot(5);

  async function openJob() {
    const created = await api
      .post("jobs", poster, {
        title: "Block safety test job",
        description: "A synthetic job used only by the block safety test.",
        categoryId,
        skillIds: [skillId],
        locationId,
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "10000",
        budgetMaxPoisha: "20000",
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    await api.post(`jobs/${created.body.data.id}/publish`, poster).expect(201);
    return created.body.data.id as string;
  }

  const application = {
    message: "I can do this job on time.",
    proposedPricePoisha: "15000",
    proposedStartsAt: slot.startsAt.toISOString(),
    proposedEndsAt: slot.endsAt.toISOString(),
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    categoryId = category.id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    // A skill only these test workers have keeps suggestions and the
    // directory small and deterministic.
    skillId = (
      await api.db.skill.create({
        data: {
          slug: `block-test-${randomUUID()}`,
          category_id: categoryId,
          name_en: "Block test skill",
          name_bn: "ব্লক পরীক্ষা দক্ষতা",
        },
      })
    ).id;
    poster = await api.actor([RoleMode.CUSTOMER]);
    blocked = await api.actor([RoleMode.WORKER]);
    other = await api.actor([RoleMode.WORKER]);
    for (const worker of [blocked, other])
      await api.db.userSkill.create({
        data: {
          user_id: worker.id,
          skill_id: skillId,
          level: SkillLevel.INTERMEDIATE,
        },
      });
    jobId = await openJob();
    // The worker applied before the block was made.
    blockedApplicationId = (
      await api
        .post(`jobs/${jobId}/applications`, blocked, application)
        .expect(201)
    ).body.data.id;
    await api
      .get(`jobs/${jobId}/suggested-workers`, poster)
      .expect(200)
      .then((response) =>
        expect(
          response.body.data.items.map((item: { id: string }) => item.id),
        ).toEqual(expect.arrayContaining([blocked.id, other.id])),
      );
    // The worker blocks the poster; the poster must lose access too.
    await api.post(`users/${poster.id}/block`, blocked).expect(201);
  });

  afterAll(async () => {
    await api?.close();
  });

  const ids = (body: { data: { items: Array<{ id: string }> } }) =>
    body.data.items.map((item) => item.id);

  it("hides the poster's jobs from the feed", async () => {
    expect(
      ids((await api.get("jobs", blocked).expect(200)).body),
    ).not.toContain(jobId);
    expect(ids((await api.get("jobs", other).expect(200)).body)).toContain(
      jobId,
    );
  });

  it("hides the job detail both ways", async () => {
    await api.get(`jobs/${jobId}`, blocked).expect(404);
    await api.get(`jobs/${jobId}`, other).expect(200);
  });

  it("leaves blocked workers out of suggestions", async () => {
    const response = await api
      .get(`jobs/${jobId}/suggested-workers`, poster)
      .expect(200);
    expect(ids(response.body)).not.toContain(blocked.id);
    expect(ids(response.body)).toContain(other.id);
  });

  it("hides the blocked worker's application and refuses to accept it", async () => {
    const list = await api
      .get(`jobs/${jobId}/applications`, poster)
      .expect(200);
    expect(ids(list.body)).not.toContain(blockedApplicationId);
    const accept = await api
      .post(`applications/${blockedApplicationId}/accept`, poster)
      .expect(422);
    expect(accept.body.error.code).toBe("HIRING_UNAVAILABLE");
  });

  it("refuses a new application", async () => {
    const second = await openJob();
    const response = await api
      .post(`jobs/${second}/applications`, blocked, application)
      .expect(422);
    // Deliberately vague: it does not say who blocked whom.
    expect(response.body.error).toMatchObject({
      code: "HIRING_UNAVAILABLE",
      message: "This worker can't be hired for this job.",
    });
  });

  it("refuses a direct booking", async () => {
    const response = await api
      .post(`workers/${blocked.id}/booking-requests`, poster, {
        title: "Block safety booking",
        description: "A synthetic booking request for the block safety test.",
        categoryId,
        locationId,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        offeredPricePoisha: "15000",
      })
      .expect(422);
    expect(response.body.error.code).toBe("HIRING_UNAVAILABLE");
  });

  it("refuses to start a conversation, from either side", async () => {
    for (const [from, to] of [
      [blocked, poster],
      [poster, blocked],
    ] as const) {
      const response = await api
        .post(`jobs/${jobId}/conversations`, from, { participantUserId: to.id })
        .expect(403);
      expect(response.body.error).toMatchObject({
        code: "USER_BLOCKED",
        messageKey: "error.safety.blocked",
      });
    }
  });

  it("hides the worker's public profile and directory entry from a signed-in blocked viewer", async () => {
    await api.get(`users/${blocked.id}/public`, poster).expect(404);
    // Other users still see it; signing out does not help (API-6: 401).
    await api.get(`users/${blocked.id}/public`).expect(401);
    await api.get(`users/${blocked.id}/public`, other).expect(200);

    const signedIn = await api
      .get(`users/workers?skillId=${skillId}`, poster)
      .expect(200);
    expect(ids(signedIn.body)).not.toContain(blocked.id);
    expect(ids(signedIn.body)).toContain(other.id);
    await api.get(`users/workers?skillId=${skillId}`).expect(401);
  });

  it("hides the worker's availability slots", async () => {
    const range = `from=${slot.startsAt.toISOString()}&to=${new Date(
      slot.startsAt.getTime() + 86_400_000,
    ).toISOString()}`;
    await api
      .get(`workers/${blocked.id}/availability/slots?${range}`, poster)
      .expect(404);
    await api
      .get(`workers/${other.id}/availability/slots?${range}`, poster)
      .expect(200);
  });

  it("restores access after an unblock", async () => {
    await api.delete(`users/${poster.id}/block`, blocked).expect(200);
    await api.get(`jobs/${jobId}`, blocked).expect(200);
    expect(ids((await api.get("jobs", blocked).expect(200)).body)).toContain(
      jobId,
    );
    await api.post(`users/${poster.id}/block`, blocked).expect(201);
  });
});
