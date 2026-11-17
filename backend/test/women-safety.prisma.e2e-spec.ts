import { randomUUID } from "node:crypto";
import { AdminRole, RoleMode } from "@prisma/client";

import { ModerationService } from "../src/modules/moderation/moderation.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P3.7: home-based / flexible work, no gender-restricted posts, safety queue. */
databaseDescribe("women-focused work and the safety queue (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let categoryId: string;
  let skillId: string;
  let locationId: string;
  let homeJobId: string;
  let siteJobId: string;
  const slot = futureSlot(8);

  const post = (extra: object) =>
    api.post("jobs", poster, {
      title: "Embroidery for wedding saris",
      description: "Hand embroidery on six saris before the wedding season.",
      categoryId,
      skillIds: [skillId],
      locationId,
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      budgetMinPoisha: "300000",
      budgetMaxPoisha: "400000",
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      ...extra,
    });
  const feedIds = async (query: string) =>
    (
      await api.get(`jobs?limit=100${query}`, worker).expect(200)
    ).body.data.items.map((item: { id: string }) => item.id);

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null, skills: { some: {} } },
      include: { skills: { take: 1 } },
    });
    categoryId = category.id;
    skillId = category.skills[0]!.id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("home-based and flexible work", () => {
    it("posts a job with its arrangement and flexible hours", async () => {
      const home = await post({
        workArrangement: "HOME_BASED",
        flexibleHours: true,
      }).expect(201);
      homeJobId = home.body.data.id;
      expect(home.body.data).toMatchObject({
        work_arrangement: "HOME_BASED",
        flexible_hours: true,
      });
      const site = await post({ title: "Shop counter help" }).expect(201);
      siteJobId = site.body.data.id;
      expect(site.body.data).toMatchObject({
        work_arrangement: "ON_SITE",
        flexible_hours: false,
      });
      for (const id of [homeJobId, siteJobId])
        await api.post(`jobs/${id}/publish`, poster).expect(201);
    });

    it("filters the feed by arrangement and flexible hours", async () => {
      const home = await feedIds("&workArrangement=HOME_BASED,REMOTE");
      expect(home).toContain(homeJobId);
      expect(home).not.toContain(siteJobId);
      const flexible = await feedIds("&flexibleHours=true");
      expect(flexible).toContain(homeJobId);
      expect(flexible).not.toContain(siteJobId);
      const all = await feedIds("");
      expect(all).toEqual(expect.arrayContaining([homeJobId, siteJobId]));
      await api.get("jobs?workArrangement=AT_HOME", worker).expect(400);
    });

    it("matches a worker's saved preferences", async () => {
      const saved = await api
        .put("profiles/me/worker", worker, {
          preferredArrangements: ["HOME_BASED"],
          prefersFlexibleHours: true,
        })
        .expect(200);
      expect(saved.body.data).toMatchObject({
        preferredArrangements: ["HOME_BASED"],
        prefersFlexibleHours: true,
      });
      const mine = await feedIds("&matchMyPreferences=true");
      expect(mine).toContain(homeJobId);
      expect(mine).not.toContain(siteJobId);
    });
  });

  describe("no gender-restricted job posts", () => {
    it.each([
      [
        "description",
        { description: "Cook needed for a family of four, women only please." },
      ],
      [
        "description",
        { description: "Night guard wanted. No females, sorry." },
      ],
      ["title", { title: "শুধুমাত্র মহিলা রাঁধুনি চাই" }],
      ["description", { description: "দোকানে কাজ। পুরুষ প্রার্থী নয়।" }],
    ])("refuses a %s that excludes a gender", async (field, extra) => {
      const refused = await post(extra).expect(400);
      expect(refused.body.error).toMatchObject({
        code: "GENDER_RESTRICTION_NOT_ALLOWED",
        messageKey: "error.job.gender_restriction",
        field,
      });
    });

    it("allows work that merely mentions women", async () => {
      await post({
        title: "Stitching women's blouses",
        description:
          "Stitch 20 blouses for a women's clothing shop, from home.",
      }).expect(201);
    });
  });

  describe("priority safety queue", () => {
    let moderation: ModerationService;
    const admin = {
      userId: "",
      email: "safety@kaj.test",
      role: AdminRole.MODERATOR,
      sessionId: randomUUID(),
    };
    const context = { ip: "127.0.0.1", ua: "safety-queue-test" };
    let urgentId: string;
    let normalId: string;

    beforeAll(async () => {
      moderation = api.app.get(ModerationService);
      admin.userId = (await api.actor([RoleMode.CUSTOMER])).id;
      const reporter = await api.actor([RoleMode.WORKER]);
      const report = (reasonCode: string) =>
        api
          .post("reports", reporter, {
            targetType: "USER",
            targetId: poster.id,
            reasonCode,
            description: "Something happened during the job visit.",
          })
          .expect(201);
      normalId = (await report("OTHER")).body.data.id;
      urgentId = (await report("SEXUAL_HARASSMENT")).body.data.id;
      for (const reason of ["STALKING", "UNSAFE_LOCATION"])
        await report(reason);
    });

    it("gives safety reasons priority automatically", async () => {
      const rows = await api.db.report.findMany({
        where: { id: { in: [urgentId, normalId] } },
        select: { id: true, priority: true },
      });
      expect(
        Object.fromEntries(rows.map((row) => [row.id, row.priority])),
      ).toEqual({
        [urgentId]: 2,
        [normalId]: 0,
      });
    });

    it("lists the most urgent first, with the time limit to first action", async () => {
      const queue = await moderation.queue(
        { limit: 100, minPriority: 1 } as never,
        admin,
        context,
      );
      const ids = queue.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(urgentId);
      expect(ids).not.toContain(normalId);
      const priorities = queue.items.map(
        (item: { priority: number }) => item.priority,
      );
      expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
      const urgent = queue.items.find(
        (item: { id: string }) => item.id === urgentId,
      )!;
      expect(urgent).toMatchObject({
        priority: 2,
        firstActionAt: null,
        overdue: false,
        firstActionDueAt: expect.any(String),
      });
      const due = new Date(urgent.firstActionDueAt).getTime() - Date.now();
      expect(due).toBeGreaterThan(50 * 60_000);
      expect(due).toBeLessThanOrEqual(60 * 60_000);
    });

    it("records the first action and flags an overdue report", async () => {
      await moderation.startReview(urgentId, admin, context);
      const after = await moderation.queue(
        { limit: 100, minPriority: 2 } as never,
        admin,
        context,
      );
      expect(
        after.items.find((item: { id: string }) => item.id === urgentId),
      ).toMatchObject({
        firstActionAt: expect.any(String),
        timeToFirstActionMinutes: 0,
        overdue: false,
      });
      // An untouched urgent report older than an hour is overdue.
      const stale = await api.db.report.findFirstOrThrow({
        where: { reason_code: "STALKING", first_action_at: null },
      });
      await api.db.report.update({
        where: { id: stale.id },
        data: { created_at: new Date(Date.now() - 2 * 3_600_000) },
      });
      const late = await moderation.queue(
        { limit: 100, minPriority: 2 } as never,
        admin,
        context,
      );
      expect(
        late.items.find((item: { id: string }) => item.id === stale.id),
      ).toMatchObject({
        overdue: true,
        ageMinutes: expect.any(Number),
      });
    });
  });
});
