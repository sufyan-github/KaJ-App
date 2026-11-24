import "reflect-metadata";
import { randomUUID } from "node:crypto";

import { AdminRole, LocationType, RoleMode } from "@prisma/client";

import { phoneSearch } from "../src/modules/subscriptions/subscriptions.service";
import { adminSession } from "./support/admin-session";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

const REASON = "Requested by the operations lead today.";

/** R7 admin fixes (A3, A6, A7) over real HTTP; probe ids in the test names. */
databaseDescribe("R7 admin fixes (real HTTP)", () => {
  let api: HttpHarness;
  let admin: Actor;
  const tag = randomUUID().slice(0, 8);
  const createdLocations: string[] = [];
  const createdCourses: string[] = [];

  beforeAll(async () => {
    api = await HttpHarness.start();
    admin = await adminSession(api, AdminRole.ADMIN);
  });

  afterAll(async () => {
    await api.db.auditLog.deleteMany({ where: { actor_user_id: admin.id } });
    await api.db.trainingCourse.deleteMany({
      where: { id: { in: createdCourses } },
    });
    for (const id of [...createdLocations].reverse())
      await api.db.location.delete({ where: { id } }).catch(() => undefined);
    await api?.close();
  });

  /** The newest audit row of `action` written by this test's admin. */
  function lastAudit(action: string) {
    return api.db.auditLog.findFirst({
      where: { actor_user_id: admin.id, action },
      orderBy: { created_at: "desc" },
    });
  }

  describe("A3 campaign segments (E10.5)", () => {
    const campaign = (segment: Record<string, unknown>) => ({
      name: "Segment test",
      title: "Notice",
      body: "Segment validation test.",
      segment,
      throttlePerMinute: 100,
    });

    it("refuses a mistyped key instead of meaning everyone", async () => {
      const response = await api.post(
        "admin/notifications/campaign/dry-run",
        admin,
        campaign({ rol: "WORKER" }),
      );
      expect(response.status).toBe(400);
      expect(JSON.stringify(response.body.error)).toContain("rol");
    });

    it("refuses bad values and unknown places", async () => {
      for (const segment of [
        { role: "ADMIN" },
        { locationId: "not-a-uuid" },
        { status: "SLEEPING" },
      ])
        expect(
          (
            await api.post(
              "admin/notifications/campaign/dry-run",
              admin,
              campaign(segment),
            )
          ).status,
        ).toBe(400);
      const unknown = await api.post(
        "admin/notifications/campaign/dry-run",
        admin,
        campaign({ locationId: randomUUID() }),
      );
      expect(unknown.status).toBe(400);
      expect(unknown.body.error).toMatchObject({
        code: "CAMPAIGN_SEGMENT_INVALID",
        field: "segment.locationId",
      });
    });

    it("a valid segment dry-runs and is audited", async () => {
      const response = await api.post(
        "admin/notifications/campaign/dry-run",
        admin,
        campaign({ role: "WORKER", status: "ACTIVE" }),
      );
      expect(response.status).toBe(201);
      expect(await lastAudit("ADMIN_NOTIFICATION_DRY_RUN")).not.toBeNull();
    });

    it("sending needs a typed reason, kept in the audit row", async () => {
      const groupless = campaign({ communityGroupId: randomUUID() });
      expect(
        (await api.post("admin/notifications/campaign/send", admin, groupless))
          .status,
      ).toBe(400);
      const owner = await api.actor([RoleMode.CUSTOMER]);
      const group = await api.db.communityGroup.create({
        data: { created_by_user_id: owner.id, name: `R7 group ${tag}` },
      });
      const segment = { communityGroupId: group.id };
      expect(
        (
          await api.post(
            "admin/notifications/campaign/send",
            admin,
            campaign(segment),
          )
        ).status,
      ).toBe(400);
      const sent = await api.post("admin/notifications/campaign/send", admin, {
        ...campaign(segment),
        reason: REASON,
      });
      expect(sent.status).toBe(201);
      const row = await lastAudit("ADMIN_NOTIFICATION_CAMPAIGN_SENT");
      expect(row?.after_json).toMatchObject({ reason: REASON, segment });
      await api.db.notificationCampaign.deleteMany({
        where: { id: sent.body.data.id },
      });
      await api.db.communityGroup.delete({ where: { id: group.id } });
    });
  });

  describe("A6 AI access rule (E7.13)", () => {
    it("AI_IDEA_ANALYSIS can be saved, with an audit row and reason", async () => {
      const current = await api.db.subscriptionAccessRule.findUniqueOrThrow({
        where: { feature_key: "AI_IDEA_ANALYSIS" },
      });
      const response = await api.put(
        "admin/subscriptions/access-rules/AI_IDEA_ANALYSIS",
        admin,
        {
          requiresActiveSubscription: current.requires_active_subscription,
          isActive: current.is_active,
          reason: REASON,
        },
      );
      expect(response.status).toBe(200);
      const row = await lastAudit("subscription.access-rule.updated");
      expect(row?.after_json).toMatchObject({ reason: REASON });
      const unknown = await api.put(
        "admin/subscriptions/access-rules/NOT_A_FEATURE",
        admin,
        { requiresActiveSubscription: true, isActive: true, reason: REASON },
      );
      expect(unknown.status).toBe(400);
    });
  });

  describe("A7 locations (E8.12, E8.13)", () => {
    let cityId: string;
    let thanaId: string;
    let areaId: string;

    const location = (body: Record<string, unknown>) =>
      api.post("admin/locations", admin, {
        isActive: false,
        reason: REASON,
        ...body,
      });

    beforeAll(async () => {
      const city = await location({
        type: LocationType.CITY,
        nameEn: `R7 City ${tag}`,
        nameBn: "পরীক্ষা শহর",
      });
      expect(city.status).toBe(201);
      cityId = city.body.data.id;
      createdLocations.push(cityId);
      const thana = await location({
        type: LocationType.THANA,
        parentId: cityId,
        nameEn: `R7 Thana ${tag}`,
        nameBn: "পরীক্ষা থানা",
      });
      expect(thana.status).toBe(201);
      thanaId = thana.body.data.id;
      createdLocations.push(thanaId);
      const area = await location({
        type: LocationType.AREA,
        parentId: thanaId,
        nameEn: `R7 Area ${tag}`,
        nameBn: "পরীক্ষা এলাকা",
        lat: 24.3745,
        lng: 88.6042,
      });
      expect(area.status).toBe(201);
      areaId = area.body.data.id;
      createdLocations.push(areaId);
    });

    it("keeps CITY > THANA > AREA", async () => {
      for (const [body, field] of [
        [{ type: "CITY", parentId: areaId }, "parentId"],
        [{ type: "THANA", parentId: areaId }, "parentId"],
        [{ type: "AREA", parentId: cityId }, "parentId"],
        [{ type: "AREA" }, "parentId"],
      ] as const) {
        const response = await location({
          ...body,
          nameEn: `Broken ${tag} ${field}`,
          nameBn: "ভুল",
        });
        expect([response.status, response.body.error?.code]).toEqual([
          400,
          "LOCATION_INVALID",
        ]);
        expect(response.body.error.field).toBe(field);
      }
    });

    it("a location with children keeps its type", async () => {
      const response = await api.put(`admin/locations/${thanaId}`, admin, {
        type: "AREA",
        parentId: thanaId,
        nameEn: `R7 Thana ${tag}`,
        nameBn: "পরীক্ষা থানা",
        isActive: false,
        reason: REASON,
      });
      expect(response.status).toBe(400);
    });

    it("refuses coordinates out of range, outside Bangladesh or unpaired", async () => {
      for (const coordinates of [
        { lat: 95, lng: 88.6 },
        { lat: 24.3, lng: 200 },
        { lat: 40.7, lng: -74 },
        { lat: 24.3 },
      ]) {
        const response = await location({
          type: "AREA",
          parentId: thanaId,
          nameEn: `Bad point ${tag} ${JSON.stringify(coordinates)}`,
          nameBn: "ভুল বিন্দু",
          ...coordinates,
        });
        expect(response.status).toBe(400);
      }
    });

    it("records the typed reason", async () => {
      const row = await api.db.auditLog.findFirst({
        where: { entity_id: areaId, action: "ADMIN_LOCATION_CREATED" },
      });
      expect(row?.after_json).toMatchObject({ reason: REASON });
    });
  });

  describe("A7 courses (E11.3)", () => {
    it("a course with no lessons cannot be published", async () => {
      const slug = `r7-empty-${tag}`;
      const created = await api.post("admin/training/courses", admin, {
        reason: REASON,
        document: {
          slug,
          skillSlug: null,
          titleEn: "Empty course",
          titleBn: "খালি কোর্স",
          summaryEn: "A draft with no lessons.",
          summaryBn: "পাঠ ছাড়া খসড়া।",
          minutes: 5,
          estDataMb: 1,
          passMarkPct: 70,
          questionCount: 1,
          isSafetyCritical: false,
          sortOrder: 0,
          lessons: [],
          questions: [
            {
              promptEn: "Is this a test?",
              promptBn: "এটা কি পরীক্ষা?",
              options: [
                { id: "a", en: "Yes", bn: "হ্যাঁ" },
                { id: "b", en: "No", bn: "না" },
              ],
              correctOptionId: "a",
              explanationEn: "It is.",
              explanationBn: "হ্যাঁ।",
            },
          ],
        },
      });
      // A draft may have no lessons yet (E11.3); publishing it may not.
      expect(created.status).toBe(201);
      createdCourses.push(created.body.data.id);
      expect(
        (await lastAudit("ADMIN_COURSE_CREATED"))?.after_json,
      ).toMatchObject({ reason: REASON });
      const publish = await api.post(
        `admin/training/courses/${created.body.data.id}/publish`,
        admin,
        { reason: REASON },
      );
      expect([publish.status, publish.body.error?.code]).toEqual([
        409,
        "COURSE_HAS_NO_LESSONS",
      ]);
    });

    it("creating or editing a course needs a reason", async () => {
      const response = await api.post("admin/training/courses", admin, {
        document: { slug: `r7-no-reason-${tag}` },
      });
      expect(response.status).toBe(400);
    });
  });

  describe("A7 typed reasons in audit rows (E12.5)", () => {
    it("categories, skills and sectors refuse a missing reason and record it", async () => {
      const category = await api.db.category.findFirstOrThrow({
        where: { parent_id: null },
      });
      const skillBody = {
        categoryId: category.id,
        slug: `r7-skill-${tag}`,
        nameEn: "R7 skill",
        nameBn: "পরীক্ষা দক্ষতা",
        isActive: false,
      };
      expect((await api.post("admin/skills", admin, skillBody)).status).toBe(
        400,
      );
      const skill = await api.post("admin/skills", admin, {
        ...skillBody,
        reason: REASON,
      });
      expect(skill.status).toBe(201);
      expect(
        (await lastAudit("ADMIN_SKILL_CREATED"))?.after_json,
      ).toMatchObject({ reason: REASON });
      await api.db.skill.delete({ where: { id: skill.body.data.id } });

      const sectorBody = {
        slug: `r7-sector-${tag}`,
        nameEn: "R7 sector",
        nameBn: "পরীক্ষা খাত",
        isActive: false,
      };
      expect(
        (await api.post("admin/business-categories", admin, sectorBody)).status,
      ).toBe(400);
      const sector = await api.post("admin/business-categories", admin, {
        ...sectorBody,
        reason: REASON,
      });
      expect(sector.status).toBe(201);
      expect(
        (await lastAudit("ADMIN_BUSINESS_CATEGORY_CREATED"))?.after_json,
      ).toMatchObject({ reason: REASON });
      await api.db.businessCategory.delete({
        where: { id: sector.body.data.id },
      });
    });

    it("moderation and restore keep the reason in the audit row", async () => {
      const person = await api.actor([RoleMode.WORKER]);
      const warn = await api.post(
        `admin/users/${person.id}/moderation`,
        admin,
        {
          action: "WARN",
          reason: REASON,
        },
      );
      expect(warn.status).toBe(201);
      expect(
        (await lastAudit("ADMIN_MODERATION_LEVEL_CHANGED"))?.after_json,
      ).toMatchObject({ reason: REASON });
      const restore = await api.post(
        `admin/users/${person.id}/moderation/restore`,
        admin,
        { reason: "Warning withdrawn after review." },
      );
      expect(restore.status).toBe(201);
      expect(
        (await lastAudit("ADMIN_USER_RESTORED"))?.after_json,
      ).toMatchObject({ reason: "Warning withdrawn after review." });
    });

    it("a read-only view of a person needs a reason", async () => {
      const person = await api.actor([RoleMode.CUSTOMER]);
      expect(
        (await api.get(`admin/users/${person.id}/impersonate-read-only`, admin))
          .status,
      ).toBe(400);
      const view = await api.get(
        `admin/users/${person.id}/impersonate-read-only?reason=${encodeURIComponent(REASON)}`,
        admin,
      );
      expect(view.status).toBe(200);
      expect(
        (await lastAudit("ADMIN_READ_ONLY_IMPERSONATION"))?.after_json,
      ).toMatchObject({ reason: REASON });
    });
  });

  describe("A7 subscription search by phone (E7.3)", () => {
    it("finds a subscriber however the number is typed", async () => {
      const subscriber = await api.actor([RoleMode.WORKER]);
      const user = await api.db.user.findUniqueOrThrow({
        where: { id: subscriber.id },
      });
      const plan = await api.db.subscriptionPlan.create({
        data: {
          code: `R7_PLAN_${tag.toUpperCase()}`,
          name_en: "R7 plan",
          name_bn: "পরীক্ষা প্ল্যান",
          price_poisha: 278n,
          duration_days: 1,
          feature_keys: [],
        },
      });
      const subscription = await api.db.subscription.create({
        data: { user_id: subscriber.id, plan_id: plan.id },
      });
      const local = `0${user.phone_e164!.slice(4)}`; // +8801… → 01…
      for (const typed of [
        local,
        user.phone_e164!,
        `+880 ${user.phone_e164!.slice(4, 8)}-${user.phone_e164!.slice(8)}`,
      ]) {
        const response = await api.get(
          `admin/subscriptions?search=${encodeURIComponent(typed)}`,
          admin,
        );
        expect(response.status).toBe(200);
        expect(
          response.body.data.items.map((i: { id: string }) => i.id),
        ).toEqual([subscription.id]);
      }
      await api.db.subscription.delete({ where: { id: subscription.id } });
      await api.db.subscriptionPlan.delete({ where: { id: plan.id } });
    });

    it("normalises Bangladeshi numbers", () => {
      expect(phoneSearch("01612348080")).toBe("1612348080");
      expect(phoneSearch("+880 1612-348080")).toBe("1612348080");
      expect(phoneSearch("8801612348080")).toBe("1612348080");
      expect(phoneSearch("Rahima")).toBeNull();
    });
  });
});
