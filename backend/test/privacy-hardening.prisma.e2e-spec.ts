import { randomUUID } from "node:crypto";
import {
  AssignmentStatus,
  MessagePermission,
  PhotoVisibility,
  Prisma,
  RoleMode,
  SkillLevel,
} from "@prisma/client";
import request from "supertest";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P0.7: profile privacy settings, booking-only slots, security headers. */
databaseDescribe("privacy settings and hardening (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let skillId: string;
  let categoryId: string;
  let locationId: string;
  const slot = futureSlot(9);

  const ids = (body: { data: { items: Array<{ id: string }> } }) =>
    body.data.items.map((item) => item.id);
  const directory = (as?: Actor) =>
    api.get(`users/workers?skillId=${skillId}`, as).expect(200);
  const setPrivacy = (as: Actor, body: object) =>
    api.put("profiles/me/privacy", as, body).expect(200);

  async function openJob() {
    const created = await api
      .post("jobs", poster, {
        title: "Privacy test job",
        description: "A synthetic job used only by the privacy settings test.",
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

  beforeAll(async () => {
    api = await HttpHarness.start();
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    skillId = (
      await api.db.skill.create({
        data: {
          slug: `privacy-test-${randomUUID()}`,
          category_id: categoryId,
          name_en: "Privacy test skill",
          name_bn: "গোপনীয়তা পরীক্ষা দক্ষতা",
        },
      })
    ).id;
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER], {
      displayName: "Shirin Akter",
      profile: {
        lat: new Prisma.Decimal(24.37421),
        lng: new Prisma.Decimal(88.60412),
        photo_key: "private/documents/privacy-test/photo.jpg",
        primary_location_id: locationId,
      },
    });
    await api.db.userSkill.create({
      data: {
        user_id: worker.id,
        skill_id: skillId,
        level: SkillLevel.INTERMEDIATE,
      },
    });
  });

  afterAll(async () => {
    await api?.close();
  });

  it("reads and partly updates the privacy settings, with safe defaults", async () => {
    const defaults = await api.get("profiles/me/privacy", worker).expect(200);
    expect(defaults.body.data).toEqual({
      photoVisibility: "EVERYONE",
      showFullName: false,
      hidePreciseArea: false,
      allowMessagesFrom: "ANYONE",
      discoverable: true,
    });
    const updated = await setPrivacy(worker, { hidePreciseArea: true });
    expect(updated.body.data).toMatchObject({
      hidePreciseArea: true,
      photoVisibility: "EVERYONE",
    });
    await api
      .put("profiles/me/privacy", worker, { photoVisibility: "FRIENDS" })
      .expect(400);
    await setPrivacy(worker, { hidePreciseArea: false });
  });

  it("applies the defaults: masked name, coarse point, photo shown", async () => {
    const profile = await api.get(`users/${worker.id}/public`).expect(200);
    expect(profile.body.data).toMatchObject({
      displayName: "Shirin A.",
      location: { latitude: 24.375, longitude: 88.605 },
      photoUrl: expect.any(String),
    });
  });

  it("shows the full name only when the person chose to", async () => {
    await setPrivacy(worker, { showFullName: true });
    const profile = await api.get(`users/${worker.id}/public`).expect(200);
    expect(profile.body.data.displayName).toBe("Shirin Akter");
    await setPrivacy(worker, { showFullName: false });
  });

  it("hides the precise area but keeps the area name", async () => {
    await setPrivacy(worker, { hidePreciseArea: true });
    const profile = await api.get(`users/${worker.id}/public`).expect(200);
    expect(profile.body.data.location).toBeNull();
    expect(profile.body.data.area).not.toBeNull();
    const listed = (await directory()).body.data.items.find(
      (item: { id: string }) => item.id === worker.id,
    );
    expect(listed.location).toBeNull();
    await setPrivacy(worker, { hidePreciseArea: false });
  });

  it("hides the photo from everyone, or until a hire", async () => {
    await setPrivacy(worker, { photoVisibility: PhotoVisibility.NOBODY });
    expect(
      (await api.get(`users/${worker.id}/public`, poster).expect(200)).body.data
        .photoUrl,
    ).toBeNull();

    await setPrivacy(worker, { photoVisibility: PhotoVisibility.AFTER_HIRE });
    expect(
      (await api.get(`users/${worker.id}/public`, poster).expect(200)).body.data
        .photoUrl,
    ).toBeNull();
    // After a hire the poster sees it, in the profile and the directory.
    const jobId = await openJob();
    const application = await api.db.application.create({
      data: { job_id: jobId, worker_user_id: worker.id },
    });
    const assignment = await api.db.assignment.create({
      data: {
        job_id: jobId,
        application_id: application.id,
        worker_user_id: worker.id,
        status: AssignmentStatus.CONFIRMED,
        agreed_price_poisha: 15000n,
      },
    });
    expect(
      (await api.get(`users/${worker.id}/public`, poster).expect(200)).body.data
        .photoUrl,
    ).toEqual(expect.any(String));
    const listed = (await directory(poster)).body.data.items.find(
      (item: { id: string }) => item.id === worker.id,
    );
    expect(listed.photoUrl).toEqual(expect.any(String));
    // Still hidden from anyone else.
    expect(
      (await api.get(`users/${worker.id}/public`).expect(200)).body.data
        .photoUrl,
    ).toBeNull();
    await api.db.assignment.delete({ where: { id: assignment.id } });
    await api.db.application.delete({ where: { id: application.id } });
    await setPrivacy(worker, { photoVisibility: PhotoVisibility.EVERYONE });
  });

  it("leaves a hidden profile out of the directory and suggestions", async () => {
    const jobId = await openJob();
    expect(ids((await directory()).body)).toContain(worker.id);
    await setPrivacy(worker, { discoverable: false });

    expect(ids((await directory()).body)).not.toContain(worker.id);
    expect(ids((await directory(poster)).body)).not.toContain(worker.id);
    await api.get(`users/${worker.id}/public`).expect(404);
    const suggested = await api
      .get(`jobs/${jobId}/suggested-workers`, poster)
      .expect(200);
    expect(ids(suggested.body)).not.toContain(worker.id);

    // Someone already dealing with the worker can still open the profile.
    await api
      .post(`jobs/${jobId}/applications`, worker, {
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    await api.get(`users/${worker.id}/public`, poster).expect(200);
    await setPrivacy(worker, { discoverable: true });
  });

  it("uses the full-name choice in the applicant summary", async () => {
    const jobId = await openJob();
    await api
      .post(`jobs/${jobId}/applications`, worker, {
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    const name = async () =>
      (await api.get(`jobs/${jobId}/applications`, poster).expect(200)).body
        .data.items[0].applicant.displayName;
    expect(await name()).toBe("Shirin A.");
    await setPrivacy(worker, { showFullName: true });
    expect(await name()).toBe("Shirin Akter");
    await setPrivacy(worker, { showFullName: false });
  });

  it("lets a person accept new conversations only after a hire", async () => {
    const jobId = await openJob();
    await api
      .post(`jobs/${jobId}/applications`, worker, {
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    await setPrivacy(worker, {
      allowMessagesFrom: MessagePermission.ENGAGED_ONLY,
    });
    const refused = await api
      .post(`jobs/${jobId}/conversations`, poster, {
        participantUserId: worker.id,
      })
      .expect(403);
    expect(refused.body.error).toMatchObject({
      code: "MESSAGES_NOT_ALLOWED",
      messageKey: "error.chat.messages_after_hire_only",
    });
    // The worker can still write to the poster (the poster allows anyone).
    await api
      .post(`jobs/${jobId}/conversations`, worker, {
        participantUserId: poster.id,
      })
      .expect(201);
    await setPrivacy(worker, { allowMessagesFrom: MessagePermission.ANYONE });
    await api
      .post(`jobs/${jobId}/conversations`, poster, {
        participantUserId: worker.id,
      })
      .expect(201);
  });

  describe("availability slots only in a booking context", () => {
    const range = (from: Date, days = 14) =>
      `from=${from.toISOString()}&to=${new Date(
        from.getTime() + days * 86_400_000,
      ).toISOString()}`;

    it("serves a customer looking at upcoming dates", async () => {
      const response = await api
        .get(
          `workers/${worker.id}/availability/slots?${range(new Date())}`,
          poster,
        )
        .expect(200);
      expect(Array.isArray(response.body.data.slots)).toBe(true);
    });

    it("refuses someone who cannot hire", async () => {
      const otherWorker = await api.actor([RoleMode.WORKER]);
      await api
        .get(
          `workers/${worker.id}/availability/slots?${range(new Date())}`,
          otherWorker,
        )
        .expect(403);
    });

    it("refuses past dates", async () => {
      const response = await api
        .get(
          `workers/${worker.id}/availability/slots?${range(
            new Date(Date.now() - 30 * 86_400_000),
            7,
          )}`,
          poster,
        )
        .expect(400);
      expect(response.body.error.message).toContain("upcoming");
    });

    it("hides a non-discoverable worker from strangers", async () => {
      const stranger = await api.actor([RoleMode.CUSTOMER]);
      await setPrivacy(worker, { discoverable: false });
      await api
        .get(
          `workers/${worker.id}/availability/slots?${range(new Date())}`,
          stranger,
        )
        .expect(404);
      // The poster the worker applied to can still book.
      await api
        .get(
          `workers/${worker.id}/availability/slots?${range(new Date())}`,
          poster,
        )
        .expect(200);
      await setPrivacy(worker, { discoverable: true });
    });

    it("rate limits a viewer sweeping through schedules", async () => {
      const sweeper = await api.actor([RoleMode.CUSTOMER]);
      const path = `workers/${worker.id}/availability/slots?${range(new Date())}`;
      for (let index = 0; index < 60; index += 1)
        await api.get(path, sweeper).expect(200);
      const limited = await api.get(path, sweeper).expect(429);
      expect(limited.body.error.code).toBe("RATE_LIMITED");
      expect(limited.headers["retry-after"]).toBeDefined();
    });
  });

  it("sends security headers", async () => {
    const response = await request(api.app.getHttpServer())
      .get("/health")
      .expect(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
