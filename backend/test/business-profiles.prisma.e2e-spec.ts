import { Prisma, RoleMode, VerificationStatus } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P2.1: business profiles (stage, sector, public flags) and members. */
databaseDescribe("business profiles and members (real HTTP)", () => {
  let api: HttpHarness;
  let owner: Actor;
  let stranger: Actor;
  let sectorId: string;
  let locationId: string;
  let businessId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    owner = await api.actor([RoleMode.CUSTOMER], {
      displayName: "Jahanara Khatun",
    });
    stranger = await api.actor([RoleMode.WORKER]);
    sectorId = (
      await api.db.businessCategory.findUniqueOrThrow({
        where: { slug: "food" },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({ where: { is_active: true } })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("lists the seeded sector taxonomy in Bangla and English", async () => {
    const list = await api.get("business-categories").expect(200);
    expect(
      list.body.data.items.map((item: { slug: string }) => item.slug),
    ).toEqual(
      expect.arrayContaining([
        "agriculture",
        "technology",
        "manufacturing",
        "retail",
        "education",
        "food",
        "services",
        "construction",
        "creative",
        "tourism",
        "logistics",
      ]),
    );
    expect(list.body.data.items[0]).toEqual(
      expect.objectContaining({
        nameEn: expect.any(String),
        nameBn: expect.any(String),
      }),
    );
  });

  it("activating BUSINESS creates a private business profile, not a customer profile", async () => {
    const person = await api.actor([RoleMode.WORKER], {
      displayName: "Shapla Akter",
      profile: { primary_location_id: locationId },
    });
    const activated = await api
      .post("me/roles/activate", person, { role: "BUSINESS" })
      .expect(201);
    const createdId = activated.body.data.businessProfileId;
    expect(createdId).toEqual(expect.any(String));
    expect(
      await api.db.customerProfile.findUnique({
        where: { user_id: person.id },
      }),
    ).toBeNull();

    const mine = await api.get("me/businesses", person).expect(200);
    expect(mine.body.data.items).toEqual([
      expect.objectContaining({
        id: createdId,
        name: "Shapla Akter",
        stage: "INFORMAL",
        isPublic: false,
        verified: false,
        myRole: "OWNER",
        area: expect.objectContaining({ id: locationId }),
      }),
    ]);
    // Activating again reuses it.
    const again = await api
      .post("me/roles/activate", person, { role: "BUSINESS" })
      .expect(201);
    expect(again.body.data.businessProfileId).toBe(createdId);
    // Private: nobody else sees it.
    await api.get(`businesses/${createdId}`, stranger).expect(404);
  });

  it("creates and edits a business, public only with a sector and area", async () => {
    const created = await api
      .post("businesses", owner, {
        name: "Jahanara's Pitha Ghor",
        stage: "IDEA",
        description: "Winter pitha made at home, sold in the neighbourhood.",
      })
      .expect(201);
    businessId = created.body.data.id;
    expect(created.body.data).toMatchObject({
      stage: "IDEA",
      stageLabel: { en: "Idea stage", bn: "আইডিয়া পর্যায়" },
      isPublic: false,
      myRole: "OWNER",
      status: "ACTIVE",
      verificationStatus: "NOT_SUBMITTED",
    });

    const refused = await api
      .patch(`businesses/${businessId}`, owner, { isPublic: true })
      .expect(409);
    expect(refused.body.error).toMatchObject({
      code: "BUSINESS_PROFILE_INCOMPLETE",
      field: "categoryId",
    });
    await api
      .patch(`businesses/${businessId}`, owner, { categoryId: stranger.id })
      .expect(400);

    const published = await api
      .patch(`businesses/${businessId}`, owner, {
        stage: "INFORMAL",
        categoryId: sectorId,
        locationId,
        address: "House 12, Shaheb Bazar",
        isPublic: true,
        seekingPartners: true,
      })
      .expect(200);
    expect(published.body.data).toMatchObject({
      stage: "INFORMAL",
      category: { slug: "food" },
      isPublic: true,
      seekingPartners: true,
      address: "House 12, Shaheb Bazar",
    });

    // Public view: no private fields, masked owner name.
    const seen = await api
      .get(`businesses/${businessId}`, stranger)
      .expect(200);
    expect(seen.body.data).toMatchObject({
      name: "Jahanara's Pitha Ghor",
      myRole: null,
      owner: { userId: owner.id, displayName: "Jahanara K." },
    });
    expect(seen.body.data.address).toBeUndefined();
    expect(seen.body.data.tradeLicenceNo).toBeUndefined();
    expect(seen.body.data.verificationStatus).toBeUndefined();

    // Only owners and managers edit.
    await api
      .patch(`businesses/${businessId}`, stranger, { name: "Taken over" })
      .expect(404);
  });

  it("never shows an idea or informal business as verified, in the database too", async () => {
    await expect(
      api.db.businessProfile.update({
        where: { id: businessId },
        data: { verification_status: VerificationStatus.APPROVED },
      }),
    ).rejects.toThrow(/business_profiles_verified_stage_check/);

    // Registered + approved shows the badge; leaving REGISTERED drops it.
    await api
      .patch(`businesses/${businessId}`, owner, {
        stage: "REGISTERED",
        tradeLicenceNo: "RAJ-2026-00123",
      })
      .expect(200);
    await api.db.businessProfile.update({
      where: { id: businessId },
      data: { verification_status: VerificationStatus.APPROVED },
    });
    expect(
      (await api.get(`businesses/${businessId}`, stranger).expect(200)).body
        .data.verified,
    ).toBe(true);
    const downgraded = await api
      .patch(`businesses/${businessId}`, owner, { stage: "INFORMAL" })
      .expect(200);
    expect(downgraded.body.data).toMatchObject({
      verified: false,
      verificationStatus: "NOT_SUBMITTED",
    });
  });

  it("hides a public business from someone in a block with its owner", async () => {
    const blocked = await api.actor([RoleMode.CUSTOMER]);
    await api.db.userBlock.create({
      data: { blocker_user_id: owner.id, blocked_user_id: blocked.id },
    });
    await api.get(`businesses/${businessId}`, blocked).expect(404);
  });

  describe("members", () => {
    let manager: Actor;
    let staff: Actor;

    beforeAll(async () => {
      manager = await api.actor([RoleMode.CUSTOMER], {
        displayName: "Rafiq Islam",
      });
      staff = await api.actor([RoleMode.WORKER]);
    });

    it("invites, and the invitee accepts to become a member", async () => {
      await api
        .post(`businesses/${businessId}/members`, owner, {
          userId: manager.id,
          role: "MANAGER",
        })
        .expect(201);
      await api
        .post(`businesses/${businessId}/members`, owner, {
          userId: manager.id,
          role: "STAFF",
        })
        .expect(409);
      const pending = await api.get("me/businesses", manager).expect(200);
      expect(pending.body.data.items).toEqual([]);
      expect(pending.body.data.invitations).toEqual([
        expect.objectContaining({
          role: "MANAGER",
          business: expect.objectContaining({ id: businessId }),
        }),
      ]);
      expect(
        await api.db.notification.count({
          where: { user_id: manager.id, type: "BUSINESS_INVITATION" },
        }),
      ).toBe(1);
      // An invitation isn't membership yet.
      await api
        .patch(`businesses/${businessId}`, manager, { description: "x" })
        .expect(404);

      const joined = await api
        .post(`businesses/${businessId}/membership/accept`, manager)
        .expect(201);
      expect(joined.body.data.myRole).toBe("MANAGER");
      await api
        .patch(`businesses/${businessId}`, manager, {
          description: "Pitha and winter sweets, made fresh every morning.",
        })
        .expect(200);
      const list = await api
        .get(`businesses/${businessId}/members`, manager)
        .expect(200);
      expect(list.body.data.items).toEqual([
        expect.objectContaining({
          userId: owner.id,
          role: "OWNER",
          status: "ACTIVE",
        }),
        expect.objectContaining({
          userId: manager.id,
          role: "MANAGER",
          status: "ACTIVE",
          displayName: "Rafiq Islam",
        }),
      ]);
    });

    it("lets only owners manage members, and staff only read", async () => {
      await api
        .post(`businesses/${businessId}/members`, manager, {
          userId: staff.id,
          role: "STAFF",
        })
        .expect(404);
      await api
        .post(`businesses/${businessId}/members`, owner, {
          userId: staff.id,
          role: "STAFF",
        })
        .expect(201);
      await api
        .post(`businesses/${businessId}/membership/accept`, staff)
        .expect(201);
      await api.get(`businesses/${businessId}/members`, staff).expect(200);
      await api
        .patch(`businesses/${businessId}`, staff, { description: "staff edit" })
        .expect(404);
      await api.get(`businesses/${businessId}/members`, stranger).expect(404);
    });

    it("keeps at least one owner", async () => {
      const last = await api
        .patch(`businesses/${businessId}/members/${owner.id}`, owner, {
          role: "MANAGER",
        })
        .expect(409);
      expect(last.body.error.code).toBe("LAST_OWNER");
      await api
        .delete(`businesses/${businessId}/membership`, owner)
        .expect(409);

      // With a second owner, the first can step down.
      await api
        .patch(`businesses/${businessId}/members/${manager.id}`, owner, {
          role: "OWNER",
        })
        .expect(200);
      await api
        .patch(`businesses/${businessId}/members/${owner.id}`, manager, {
          role: "MANAGER",
        })
        .expect(200);
      await api
        .patch(`businesses/${businessId}/members/${owner.id}`, manager, {
          role: "OWNER",
        })
        .expect(200);
    });

    it("lets a member leave and an owner remove someone", async () => {
      await api
        .delete(`businesses/${businessId}/membership`, staff)
        .expect(200);
      expect(
        (await api.get("me/businesses", staff).expect(200)).body.data.items,
      ).toEqual([]);
      await api
        .delete(`businesses/${businessId}/members/${manager.id}`, owner)
        .expect(200);
      await api.get(`businesses/${businessId}/members`, manager).expect(404);
    });
  });

  it("caps owned businesses at five", async () => {
    const busy = await api.actor([RoleMode.CUSTOMER]);
    for (let index = 0; index < 5; index += 1)
      await api
        .post("businesses", busy, { name: `Shop ${index + 1}` })
        .expect(201);
    const refused = await api
      .post("businesses", busy, { name: "Shop 6" })
      .expect(409);
    expect(refused.body.error.code).toBe("BUSINESS_LIMIT_REACHED");
  });

  it("hides a suspended or deleted business from everyone but its members", async () => {
    const created = await api
      .post("businesses", owner, {
        name: "Second venture",
        categoryId: sectorId,
        locationId,
        isPublic: true,
      })
      .expect(201);
    const id = created.body.data.id;
    await api.get(`businesses/${id}`, stranger).expect(200);
    await api.db.businessProfile.update({
      where: { id },
      data: { suspended_at: new Date(), suspension_reason: "test" },
    });
    await api.get(`businesses/${id}`, stranger).expect(404);
    expect(
      (await api.get(`businesses/${id}`, owner).expect(200)).body.data.status,
    ).toBe("SUSPENDED");
    const edit = await api
      .patch(`businesses/${id}`, owner, { name: "Renamed" })
      .expect(409);
    expect(edit.body.error.code).toBe("BUSINESS_SUSPENDED");
    await api.delete(`businesses/${id}`, owner).expect(200);
    await api.get(`businesses/${id}`, owner).expect(404);
  });

  it("keeps the employee count sensible in the database", async () => {
    await expect(
      api.db.businessProfile.update({
        where: { id: businessId },
        data: { employees_count: -1 },
      }),
    ).rejects.toThrow(Prisma.PrismaClientUnknownRequestError);
  });
});
