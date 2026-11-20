import { randomUUID } from "node:crypto";
import { MentorStatus, RoleMode, TrustLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W13: feed filters that missed. A thana or city finds its areas' jobs
 * (work and learning); availableOnly works without scope=for-me;
 * flexibleHours=false filters; q searches title and description.
 */
databaseDescribe("feed filters (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let area: { id: string; parent_id: string | null };
  let thanaId: string;
  let cityId: string;
  let categoryId: string;
  let skillId: string;
  const tag = randomUUID().slice(0, 8);

  const post = async (extra: object, days = 10) => {
    const slot = futureSlot(days);
    const id = (
      await api
        .post("jobs", poster, {
          title: `Feed filter job ${tag}`,
          description: "A job used only by the feed-filter test.",
          categoryId,
          skillIds: [skillId],
          locationId: area.id,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          ...extra,
        })
        .expect(201)
    ).body.data.id as string;
    await api.post(`jobs/${id}/publish`, poster).expect(201);
    return id;
  };
  const feed = async (query: string) =>
    (
      await api.get(`jobs?limit=100&${query}`, worker).expect(200)
    ).body.data.items.map((item: { id: string }) => item.id) as string[];

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    worker = await api.actor([RoleMode.WORKER]);
    await api.db.availabilityRule.deleteMany({ where: { user_id: worker.id } });
    await api.db.availabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, day) => ({
        user_id: worker.id,
        day_of_week: day,
        start_time: new Date("1970-01-01T00:00:00Z"),
        end_time: new Date("1970-01-01T23:59:00Z"),
      })),
    });
    area = await api.db.location.findFirstOrThrow({
      where: { type: "AREA", is_active: true },
      select: { id: true, parent_id: true },
    });
    thanaId = area.parent_id!;
    cityId = (
      await api.db.location.findUniqueOrThrow({ where: { id: thanaId } })
    ).parent_id!;
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    categoryId = category.id;
    skillId = (
      await api.db.skill.findFirstOrThrow({
        where: { category_id: categoryId, is_active: true },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("finds an area's jobs from its thana and its city", async () => {
    const id = await post({});
    expect(await feed(`locationId=${area.id}`)).toContain(id);
    expect(await feed(`locationId=${thanaId}`)).toContain(id);
    expect(await feed(`locationId=${cityId}`)).toContain(id);
  });

  it("finds a learning opportunity from its thana", async () => {
    const mentor = await api.actor([RoleMode.MENTOR, RoleMode.CUSTOMER]);
    await api.db.profile.update({
      where: { user_id: mentor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    const slot = futureSlot(12);
    const id = (
      await api
        .post("learning-opportunities", mentor, {
          opportunityType: "TRAINING",
          title: `Feed filter training ${tag}`,
          description: "A training used only by the feed-filter test.",
          categoryId,
          skillIds: [],
          locationId: area.id,
          participantTerms: "FREE",
          seats: 3,
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          workArrangement: "ON_SITE",
        })
        .expect(201)
    ).body.data.id;
    await api.post(`learning-opportunities/${id}/publish`, mentor).expect(201);
    const found = await api
      .get(`learning-opportunities?limit=100&locationId=${thanaId}`, worker)
      .expect(200);
    expect(
      found.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(id);
  });

  it("keeps availableOnly working without scope=for-me", async () => {
    const id = await post({});
    expect(await feed(`availableOnly=true&locationId=${area.id}`)).toContain(
      id,
    );
  });

  it("filters flexibleHours=false and searches with q", async () => {
    const flexible = await post({ flexibleHours: true });
    const fixed = await post({ title: `Plumbing ${tag} special` });
    const notFlexible = await feed(`flexibleHours=false&locationId=${area.id}`);
    expect(notFlexible).toContain(fixed);
    expect(notFlexible).not.toContain(flexible);
    const searched = await feed(`q=${encodeURIComponent(`plumbing ${tag}`)}`);
    expect(searched).toEqual([fixed]);
  });
});
