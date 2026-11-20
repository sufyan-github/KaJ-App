import { randomUUID } from "node:crypto";
import { RoleMode, SkillLevel, TrustLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const FULL = "Parvin Sultana Khatun";
const MASKED = "Parvin S.";

/**
 * R1: one name rule everywhere (visibleDisplayName): the full name only when
 * the person chose to show it or the viewer is engaged with them.
 * Audit: API-1/G1 favourites, API-2/G4 suggested workers, G2 block list,
 * G3 business invitations, G5 idea view log.
 */
databaseDescribe("one display-name rule on every list (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let skillId: string;
  let categoryId: string;
  let locationId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    categoryId = category.id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    skillId = (
      await api.db.skill.create({
        data: {
          slug: `names-${randomUUID().slice(0, 8)}`,
          category_id: categoryId,
          name_en: "Names test skill",
          name_bn: "নাম পরীক্ষা দক্ষতা",
        },
      })
    ).id;
    poster = await api.actor([RoleMode.CUSTOMER, RoleMode.BUSINESS], {
      trust: TrustLevel.IDENTITY,
    });
    worker = await api.actor([RoleMode.WORKER], {
      displayName: FULL,
      profile: { primary_location_id: locationId },
    });
    await api.db.userSkill.create({
      data: {
        user_id: worker.id,
        skill_id: skillId,
        level: SkillLevel.ADVANCED,
      },
    });
  });

  afterAll(async () => {
    await api?.close();
  });

  it("masks favourites", async () => {
    await api.post(`me/favorites/${worker.id}`, poster).expect(201);
    const list = await api.get("me/favorites", poster).expect(200);
    expect(list.body.data.items).toEqual([
      expect.objectContaining({ userId: worker.id, displayName: MASKED }),
    ]);
    await api.delete(`me/favorites/${worker.id}`, poster).expect(200);
  });

  it("masks suggested workers", async () => {
    const slot = futureSlot(5);
    const job = await api
      .post("jobs", poster, {
        title: "Names test job",
        description: "A job used only by the display-name test.",
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
    await api.post(`jobs/${job.body.data.id}/publish`, poster).expect(201);
    const suggested = await api
      .get(`jobs/${job.body.data.id}/suggested-workers`, poster)
      .expect(200);
    const row = suggested.body.data.items.find(
      (item: { userId?: string; workerId?: string; id?: string }) =>
        (item.userId ?? item.workerId ?? item.id) === worker.id,
    );
    expect(row).toBeDefined();
    expect(JSON.stringify(suggested.body)).not.toContain(FULL);
  });

  it("masks the block list", async () => {
    const blocker = await api.actor([RoleMode.CUSTOMER]);
    await api.post(`users/${worker.id}/block`, blocker).expect(201);
    const list = await api.get("me/blocks", blocker).expect(200);
    expect(list.body.data.items).toEqual([
      expect.objectContaining({ userId: worker.id, displayName: MASKED }),
    ]);
  });

  it("masks someone only invited to a business, until they join", async () => {
    const business = (
      await api
        .post("businesses", poster, { name: "Names test shop" })
        .expect(201)
    ).body.data.id;
    const invited = await api
      .post(`businesses/${business}/members`, poster, {
        userId: worker.id,
        role: "STAFF",
      })
      .expect(201);
    const row = invited.body.data.items.find(
      (item: { userId: string }) => item.userId === worker.id,
    );
    expect(row).toMatchObject({ status: "INVITED", displayName: MASKED });
    await api
      .post(`businesses/${business}/membership/accept`, worker)
      .expect(201);
    const members = await api
      .get(`businesses/${business}/members`, poster)
      .expect(200);
    expect(
      members.body.data.items.find(
        (item: { userId: string }) => item.userId === worker.id,
      ).displayName,
    ).toBe(FULL);
  });

  it("masks approved viewers in the idea view log", async () => {
    const sector = await api.db.businessCategory.findFirstOrThrow({
      where: { is_active: true },
    });
    const idea = (
      await api
        .post("ideas", poster, {
          title: "Names test idea",
          summary: "A public line for the display-name test idea.",
          problem: "The problem statement of the names test.",
          solution: "The solution statement of the names test.",
          categoryId: sector.id,
          visibility: "SUMMARY_PUBLIC",
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`ideas/${idea}/access-requests`, worker, {
        acceptConfidentiality: true,
      })
      .expect(201);
    await api
      .post(`ideas/${idea}/access-requests/${worker.id}/approve`, poster)
      .expect(201);
    await api.get(`ideas/${idea}`, worker).expect(200);
    const views = await api.get(`ideas/${idea}/views`, poster).expect(200);
    expect(views.body.data.items[0]).toMatchObject({
      viewerUserId: worker.id,
      displayName: MASKED,
    });
  });

  it("keeps the full name where the person chose to show it", async () => {
    await api
      .put("profiles/me/privacy", worker, { showFullName: true })
      .expect(200);
    await api.post(`me/favorites/${worker.id}`, poster).expect(201);
    const list = await api.get("me/favorites", poster).expect(200);
    expect(list.body.data.items[0].displayName).toBe(FULL);
    await api
      .put("profiles/me/privacy", worker, { showFullName: false })
      .expect(200);
  });
});
