import { RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P2.2 offerings and P2.3 jobs posted for a business. */
databaseDescribe("business offerings and staff jobs (real HTTP)", () => {
  let api: HttpHarness;
  let owner: Actor;
  let staff: Actor;
  let stranger: Actor;
  let businessId: string;
  let categoryId: string;
  let skillId: string;
  let locationId: string;
  const slot = futureSlot(10);

  const jobBody = (extra: object = {}) => ({
    title: "Pitha helper for the winter season",
    description: "Help prepare and pack pitha every morning for six weeks.",
    categoryId,
    skillIds: [skillId],
    locationId,
    jobType: "ONE_TIME",
    paymentModel: "FIXED",
    budgetMinPoisha: "50000",
    budgetMaxPoisha: "80000",
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    ...extra,
  });

  beforeAll(async () => {
    api = await HttpHarness.start();
    owner = await api.actor([RoleMode.BUSINESS]);
    staff = await api.actor([RoleMode.BUSINESS, RoleMode.WORKER]);
    stranger = await api.actor([RoleMode.CUSTOMER]);
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null, skills: { some: {} } },
      include: { skills: { take: 1 } },
    });
    categoryId = category.id;
    skillId = category.skills[0]!.id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    businessId = (
      await api
        .post("businesses", owner, {
          name: "Rajshahi Pitha House",
          categoryId: sector.id,
          locationId,
          isPublic: true,
        })
        .expect(201)
    ).body.data.id;
    await api
      .post(`businesses/${businessId}/members`, owner, {
        userId: staff.id,
        role: "STAFF",
      })
      .expect(201);
    await api
      .post(`businesses/${businessId}/membership/accept`, staff)
      .expect(201);
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("offerings", () => {
    let offeringId: string;

    it("adds a product with a Bangla title and a price range", async () => {
      const created = await api
        .post(`businesses/${businessId}/offerings`, owner, {
          kind: "PRODUCT",
          titleBn: "ভাপা পিঠা",
          priceMinPoisha: "1000",
          priceMaxPoisha: "2500",
          priceUnit: "প্রতি পিস",
        })
        .expect(201);
      offeringId = created.body.data.id;
      expect(created.body.data).toMatchObject({
        kind: "PRODUCT",
        titleBn: "ভাপা পিঠা",
        titleEn: null,
        priceMinPoisha: "1000",
        priceMaxPoisha: "2500",
        status: "ACTIVE",
      });
    });

    it("refuses an offering with no title or an upside-down price", async () => {
      const untitled = await api
        .post(`businesses/${businessId}/offerings`, owner, { kind: "SERVICE" })
        .expect(400);
      expect(untitled.body.error.code).toBe("OFFERING_TITLE_REQUIRED");
      const price = await api
        .post(`businesses/${businessId}/offerings`, owner, {
          kind: "SERVICE",
          titleEn: "Catering",
          priceMinPoisha: "5000",
          priceMaxPoisha: "100",
        })
        .expect(400);
      expect(price.body.error.code).toBe("OFFERING_PRICE_INVALID");
      await api
        .patch(`businesses/${businessId}/offerings/${offeringId}`, owner, {
          titleBn: null,
        })
        .expect(400);
      await expect(
        api.db.businessOffering.create({
          data: { business_profile_id: businessId, kind: "SERVICE" },
        }),
      ).rejects.toThrow(/business_offerings_title_check/);
    });

    it("lets only owners and managers edit; staff and others read", async () => {
      await api
        .post(`businesses/${businessId}/offerings`, staff, {
          kind: "SERVICE",
          titleEn: "Staff try",
        })
        .expect(404);
      await api
        .post(`businesses/${businessId}/offerings`, stranger, {
          kind: "SERVICE",
          titleEn: "Stranger try",
        })
        .expect(404);
      const seen = await api
        .get(`businesses/${businessId}/offerings`, stranger)
        .expect(200);
      expect(seen.body.data.items).toEqual([
        expect.objectContaining({ id: offeringId, titleBn: "ভাপা পিঠা" }),
      ]);
      expect(seen.body.data.items[0].status).toBeUndefined();
    });

    it("hides an inactive offering from the public but not from members", async () => {
      const updated = await api
        .patch(`businesses/${businessId}/offerings/${offeringId}`, owner, {
          isActive: false,
          titleEn: "Bhapa pitha",
        })
        .expect(200);
      expect(updated.body.data).toMatchObject({
        status: "INACTIVE",
        titleEn: "Bhapa pitha",
        titleBn: "ভাপা পিঠা",
      });
      expect(
        (
          await api
            .get(`businesses/${businessId}/offerings`, stranger)
            .expect(200)
        ).body.data.items,
      ).toEqual([]);
      expect(
        (await api.get(`businesses/${businessId}/offerings`, staff).expect(200))
          .body.data.items,
      ).toHaveLength(1);
      await api
        .patch(`businesses/${businessId}/offerings/${offeringId}`, owner, {
          isActive: true,
        })
        .expect(200);
    });

    it("shows a moderator-hidden offering as HIDDEN to members only", async () => {
      await api.db.businessOffering.update({
        where: { id: offeringId },
        data: { hidden_at: new Date(), hidden_reason: "Misleading price" },
      });
      expect(
        (
          await api
            .get(`businesses/${businessId}/offerings`, stranger)
            .expect(200)
        ).body.data.items,
      ).toEqual([]);
      const members = await api
        .get(`businesses/${businessId}/offerings`, owner)
        .expect(200);
      expect(members.body.data.items[0]).toMatchObject({
        status: "HIDDEN",
        hiddenReason: "Misleading price",
      });
      await api.db.businessOffering.update({
        where: { id: offeringId },
        data: { hidden_at: null, hidden_reason: null },
      });
    });

    it("keeps offerings of a private business private", async () => {
      const privateId = (
        await api
          .post("businesses", owner, { name: "Hidden kitchen" })
          .expect(201)
      ).body.data.id;
      await api.get(`businesses/${privateId}/offerings`, stranger).expect(404);
      await api
        .post(`businesses/${privateId}/offerings`, owner, {
          kind: "PRODUCT",
          titleEn: "Secret recipe",
        })
        .expect(201);
      await api.get(`businesses/${privateId}/offerings`, owner).expect(200);
    });

    it("deletes an offering", async () => {
      const temp = await api
        .post(`businesses/${businessId}/offerings`, owner, {
          kind: "SERVICE",
          titleEn: "Party orders",
        })
        .expect(201);
      await api
        .delete(
          `businesses/${businessId}/offerings/${temp.body.data.id}`,
          owner,
        )
        .expect(200);
      await api
        .patch(
          `businesses/${businessId}/offerings/${temp.body.data.id}`,
          owner,
          {
            titleEn: "Back",
          },
        )
        .expect(404);
    });
  });

  describe("staff jobs", () => {
    it("posts a job for the business and shows it on the job and the business", async () => {
      const created = await api
        .post("jobs", owner, jobBody({ businessProfileId: businessId }))
        .expect(201);
      const jobId = created.body.data.id;
      expect(created.body.data.business).toEqual({
        id: businessId,
        name: "Rajshahi Pitha House",
        stage: "INFORMAL",
        verified: false,
      });
      expect(created.body.data.business_profile).toBeUndefined();
      // A business-only poster now has a customer profile for ratings.
      expect(
        await api.db.customerProfile.findUnique({
          where: { user_id: owner.id },
        }),
      ).not.toBeNull();

      // Drafts are listed for members only.
      expect(
        (await api.get(`businesses/${businessId}/jobs`, stranger).expect(200))
          .body.data.items,
      ).toEqual([]);
      expect(
        (await api.get(`businesses/${businessId}/jobs`, staff).expect(200)).body
          .data.items,
      ).toEqual([expect.objectContaining({ id: jobId, status: "DRAFT" })]);

      await api.post(`jobs/${jobId}/publish`, owner).expect(201);
      const listed = await api
        .get(`businesses/${businessId}/jobs`, stranger)
        .expect(200);
      expect(listed.body.data.items).toEqual([
        expect.objectContaining({ id: jobId, status: "APPLICATIONS_OPEN" }),
      ]);
      expect(listed.body.data.items[0].postedByUserId).toBeUndefined();
      const detail = await api.get(`jobs/${jobId}`, stranger).expect(200);
      expect(detail.body.data.business).toMatchObject({ id: businessId });
    });

    it("refuses to post for a business you are not an owner or manager of", async () => {
      const asStaff = await api
        .post("jobs", staff, jobBody({ businessProfileId: businessId }))
        .expect(404);
      expect(asStaff.body.error.field).toBe("businessProfileId");
      const outsider = await api.actor([RoleMode.BUSINESS]);
      await api
        .post("jobs", outsider, jobBody({ businessProfileId: businessId }))
        .expect(404);
    });

    it("stops publishing for a suspended business and hides it from the job", async () => {
      const created = await api
        .post("jobs", owner, jobBody({ businessProfileId: businessId }))
        .expect(201);
      await api.db.businessProfile.update({
        where: { id: businessId },
        data: { suspended_at: new Date() },
      });
      const refused = await api
        .post(`jobs/${created.body.data.id}/publish`, owner)
        .expect(409);
      expect(refused.body.error.code).toBe("BUSINESS_SUSPENDED");
      const mine = await api.get("jobs/mine", owner).expect(200);
      const row = mine.body.data.items.find(
        (item: { id: string }) => item.id === created.body.data.id,
      );
      expect(row.business).toBeNull();
      await api.db.businessProfile.update({
        where: { id: businessId },
        data: { suspended_at: null },
      });
    });

    it("leaves a plain job without a business", async () => {
      const created = await api.post("jobs", stranger, jobBody()).expect(201);
      expect(created.body.data.business).toBeNull();
    });
  });
});
