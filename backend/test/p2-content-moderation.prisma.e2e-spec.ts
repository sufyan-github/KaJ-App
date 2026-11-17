import { randomUUID } from "node:crypto";
import { AdminRole, ReportStatus, RoleMode, TrustLevel } from "@prisma/client";

import { ModerationService } from "../src/modules/moderation/moderation.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P2 admin: businesses, offerings, ideas, roles and requests in the report queue. */
databaseDescribe("P2 content moderation via the report queue", () => {
  let api: HttpHarness;
  let moderation: ModerationService;
  let admin: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };
  let owner: Actor;
  let reporter: Actor;
  let businessId: string;
  let offeringId: string;
  let ideaId: string;
  let roleId: string;
  const context = { ip: "127.0.0.1", ua: "p2-moderation-test" };

  const report = async (targetType: string, targetId: string) =>
    (
      await api
        .post("reports", reporter, {
          targetType,
          targetId,
          reasonCode: "SCAM",
          description: `This ${targetType.toLowerCase()} asks for money up front.`,
        })
        .expect(201)
    ).body.data.id as string;
  const decideHide = (reportId: string, extra: object = {}) =>
    moderation.decide(
      reportId,
      {
        status: ReportStatus.ACTIONED,
        reason: "Advance-fee scam pattern confirmed by moderation.",
        hideContent: true,
        ...extra,
      },
      admin,
      context,
    );

  beforeAll(async () => {
    api = await HttpHarness.start();
    moderation = api.app.get(ModerationService);
    const adminUser = await api.actor([RoleMode.CUSTOMER]);
    admin = {
      userId: adminUser.id,
      email: "p2-moderator@kaj.test",
      role: AdminRole.MODERATOR,
      sessionId: randomUUID(),
    };
    owner = await api.actor([RoleMode.BUSINESS], {
      trust: TrustLevel.IDENTITY,
    });
    reporter = await api.actor([RoleMode.CUSTOMER]);
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "retail" },
    });
    const location = await api.db.location.findFirstOrThrow({
      where: { is_active: true },
    });
    businessId = (
      await api
        .post("businesses", owner, {
          name: "Too Good To Be True Traders",
          categoryId: sector.id,
          locationId: location.id,
          isPublic: true,
          seekingPartners: true,
        })
        .expect(201)
    ).body.data.id;
    offeringId = (
      await api
        .post(`businesses/${businessId}/offerings`, owner, {
          kind: "SERVICE",
          titleEn: "Guaranteed 50% monthly returns",
        })
        .expect(201)
    ).body.data.id;
    ideaId = (
      await api
        .post("ideas", owner, {
          title: "Investment club",
          summary: "Pool money and double it every month, guaranteed.",
          problem: "People want quick returns on their savings.",
          solution: "Send money to me and I will double it monthly.",
          categoryId: sector.id,
          visibility: "SUMMARY_PUBLIC",
        })
        .expect(201)
    ).body.data.id;
    roleId = (
      await api
        .post(`ideas/${ideaId}/roles`, owner, {
          roleType: "MARKETING",
          title: "Recruit investors",
          skillIds: [],
          timeCommitment: "FLEXIBLE",
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("shows P2 targets in the queue with what was reported", async () => {
    const reportId = await report("BUSINESS", businessId);
    const queue = await moderation.queue(
      { limit: 100 } as never,
      admin,
      context,
    );
    const item = queue.items.find((row: { id: string }) => row.id === reportId);
    expect(item).toMatchObject({
      targetType: "BUSINESS",
      content: { title: "Too Good To Be True Traders", status: "VISIBLE" },
      subject: { id: owner.id },
    });
  });

  it("hides a reported business: suspended, out of the directory, owner told", async () => {
    const reportId = (
      await api.db.report.findFirstOrThrow({
        where: { target_type: "BUSINESS", target_id: businessId },
      })
    ).id;
    const result = await decideHide(reportId);
    expect(result).toMatchObject({ status: "ACTIONED", contentHidden: true });
    await api.get(`businesses/${businessId}`, reporter).expect(404);
    const directory = await api.get("partners?limit=100", reporter).expect(200);
    expect(
      directory.body.data.items.map((row: { id: string }) => row.id),
    ).not.toContain(businessId);
    const mine = await api.get(`businesses/${businessId}`, owner).expect(200);
    expect(mine.body.data.status).toBe("SUSPENDED");
    expect(
      await api.db.notification.count({
        where: { user_id: owner.id, type: "CONTENT_HIDDEN" },
      }),
    ).toBe(1);
    expect(
      await api.db.moderationAction.findFirst({
        where: {
          target_type: "BUSINESS",
          target_id: businessId,
          action: "HIDE_CONTENT",
        },
      }),
    ).toMatchObject({ report_id: reportId, admin_user_id: admin.userId });
    // The owner keeps their account: no user moderation was applied.
    expect(
      (await api.db.user.findUniqueOrThrow({ where: { id: owner.id } }))
        .moderation_level,
    ).toBe("NONE");

    await moderation.setContentHidden(
      "BUSINESS",
      businessId,
      false,
      "Owner explained; restored after review.",
      admin,
      context,
    );
    await api.get(`businesses/${businessId}`, reporter).expect(200);
  });

  it("hides an offering, an idea role and an idea", async () => {
    await decideHide(await report("BUSINESS_OFFERING", offeringId));
    const offerings = await api
      .get(`businesses/${businessId}/offerings`, reporter)
      .expect(200);
    expect(offerings.body.data.items).toEqual([]);

    await decideHide(await report("IDEA_ROLE", roleId));
    const roles = await api.get(`ideas/${ideaId}/roles`, reporter).expect(200);
    expect(roles.body.data.items).toEqual([]);

    await decideHide(await report("IDEA", ideaId));
    await api.get(`ideas/${ideaId}`, reporter).expect(404);
    const owned = await api.get(`ideas/${ideaId}`, owner).expect(200);
    expect(owned.body.data).toMatchObject({
      status: "HIDDEN",
      hiddenReason: "Advance-fee scam pattern confirmed by moderation.",
    });
  });

  it("hides a collaboration request from both sides", async () => {
    const other = await api.actor([RoleMode.BUSINESS]);
    const created = await api
      .post("collaboration-requests", other, {
        subjectType: "BUSINESS",
        subjectId: businessId,
        message: "Send me the deposit and I will join your business.",
      })
      .expect(201);
    const requestId = created.body.data.id;
    const reportId = (
      await api
        .post("reports", owner, {
          targetType: "COLLABORATION_REQUEST",
          targetId: requestId,
          reasonCode: "SCAM",
          description: "Asked me for a deposit to collaborate.",
        })
        .expect(201)
    ).body.data.id;
    await decideHide(reportId, {
      action: "WARN",
    });
    await api.get(`collaboration-requests/${requestId}`, other).expect(404);
    await api.get(`collaboration-requests/${requestId}`, owner).expect(404);
    // A user level was applied too (to the requester).
    expect(
      (await api.db.user.findUniqueOrThrow({ where: { id: other.id } }))
        .moderation_level,
    ).toBe("WARN");
  });

  it("refuses hideContent on non-content targets and an action-less decision", async () => {
    const userReport = await report("USER", owner.id);
    await expect(decideHide(userReport)).rejects.toMatchObject({ status: 400 });
    await expect(
      moderation.decide(
        userReport,
        {
          status: ReportStatus.ACTIONED,
          reason: "No action given here at all.",
        },
        admin,
        context,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("keeps the admin content routes behind the admin session", async () => {
    await api
      .post(`admin/content/IDEA/${ideaId}/restore`, owner, {
        reason: "Trying to restore my own idea.",
      })
      .expect(401);
  });
});
