import { randomUUID } from "node:crypto";
import { AdminRole, BusinessMemberRole, RoleMode } from "@prisma/client";

import { ModerationService } from "../src/modules/moderation/moderation.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W8: a business's jobs belong to the business. Its active owners and
 * managers run them, whoever posted; a manager who left loses them; notices
 * about the business go to whoever owns it now.
 */
databaseDescribe("business jobs follow membership (real HTTP)", () => {
  let api: HttpHarness;
  let owner: Actor;
  let manager: Actor;
  let businessId: string;
  let jobId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    owner = await api.actor([RoleMode.BUSINESS, RoleMode.CUSTOMER]);
    manager = await api.actor([RoleMode.BUSINESS, RoleMode.CUSTOMER]);
    const [sector, area, category] = await Promise.all([
      api.db.businessCategory.findUniqueOrThrow({ where: { slug: "food" } }),
      api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      }),
      api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      }),
    ]);
    businessId = (
      await api
        .post("businesses", owner, {
          name: "Membership kitchen",
          categoryId: sector.id,
          locationId: area.id,
        })
        .expect(201)
    ).body.data.id;
    await api.db.businessMember.create({
      data: {
        business_profile_id: businessId,
        user_id: manager.id,
        role: BusinessMemberRole.MANAGER,
        invited_by_user_id: owner.id,
        accepted_at: new Date(),
      },
    });
    const skill = await api.db.skill.findFirstOrThrow({
      where: { category_id: category.id, is_active: true },
    });
    const slot = futureSlot(22);
    jobId = (
      await api
        .post("jobs", manager, {
          title: "Kitchen helper",
          description: "A business job posted by a manager (W8 test).",
          categoryId: category.id,
          skillIds: [skill.id],
          locationId: area.id,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
          businessProfileId: businessId,
        })
        .expect(201)
    ).body.data.id;
    await api.post(`jobs/${jobId}/publish`, manager).expect(201);
    const worker = await api.actor([RoleMode.WORKER]);
    await api.db.application.create({
      data: { job_id: jobId, worker_user_id: worker.id },
    });
  });

  afterAll(async () => {
    await api?.close();
  });

  it("lets the owner run a job a manager posted", async () => {
    const applications = await api
      .get(`jobs/${jobId}/applications`, owner)
      .expect(200);
    expect(applications.body.data.items).toHaveLength(1);
    await api.get(`jobs/${jobId}/suggested-workers`, owner).expect(200);
  });

  it("takes the job away from a manager who was removed", async () => {
    await api.get(`jobs/${jobId}/applications`, manager).expect(200);
    await api.db.businessMember.deleteMany({
      where: { business_profile_id: businessId, user_id: manager.id },
    });
    const refused = await api.get(`jobs/${jobId}/applications`, manager);
    expect([403, 404]).toContain(refused.status);
    await api.get(`jobs/${jobId}/applications`, owner).expect(200);
  });

  it("sends moderation notices to the current owner", async () => {
    const successor = await api.actor([RoleMode.BUSINESS]);
    await api.db.businessMember.create({
      data: {
        business_profile_id: businessId,
        user_id: successor.id,
        role: BusinessMemberRole.OWNER,
        accepted_at: new Date(),
      },
    });
    // The creator handed the business over and left.
    await api.db.businessMember.deleteMany({
      where: { business_profile_id: businessId, user_id: owner.id },
    });
    const admin = await api.actor([RoleMode.CUSTOMER]);
    await api.app.get(ModerationService).setContentHidden(
      "BUSINESS",
      businessId,
      true,
      "Testing who is told.",
      {
        userId: admin.id,
        email: "admin@kaj.test",
        role: AdminRole.ADMIN,
        sessionId: randomUUID(),
      },
      { ip: "127.0.0.1", ua: "w8-test" },
    );
    const told = await api.db.notification.findMany({
      where: {
        type: "CONTENT_HIDDEN",
        user_id: { in: [owner.id, successor.id] },
      },
      select: { user_id: true },
    });
    expect(told.map((row) => row.user_id)).toEqual([successor.id]);
  });
});
