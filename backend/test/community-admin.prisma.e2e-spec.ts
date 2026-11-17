import { randomUUID } from "node:crypto";
import {
  AdminRole,
  MentorStatus,
  ReportStatus,
  RoleMode,
  TrustLevel,
} from "@prisma/client";

import { CommunityAdminService } from "../src/modules/community/community-admin.service";
import { ModerationService } from "../src/modules/moderation/moderation.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P3 admin: group, session and ambassador views; moderation via reports. */
databaseDescribe("community and session admin", () => {
  let api: HttpHarness;
  let admin: CommunityAdminService;
  let moderation: ModerationService;
  let actor: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };
  let founder: Actor;
  let member: Actor;
  let groupId: string;
  let sessionId: string;
  const context = { ip: "127.0.0.1", ua: "community-admin-test" };
  const groupName = `Admin view group ${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    api = await HttpHarness.start();
    admin = api.app.get(CommunityAdminService);
    moderation = api.app.get(ModerationService);
    actor = {
      userId: (await api.actor([RoleMode.CUSTOMER])).id,
      email: "community-admin@kaj.test",
      role: AdminRole.ADMIN,
      sessionId: randomUUID(),
    };
    founder = await api.actor([RoleMode.MENTOR, RoleMode.WORKER], {
      displayName: "Admin View Founder",
      trust: TrustLevel.IDENTITY,
    });
    await api.db.profile.update({
      where: { user_id: founder.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    member = await api.actor([RoleMode.WORKER], {
      displayName: "Admin View Member",
    });
    groupId = (
      await api
        .post("community/groups", founder, { name: groupName })
        .expect(201)
    ).body.data.id;
    await api.post(`community/groups/${groupId}/join`, member).expect(201);
    sessionId = (
      await api
        .post("sessions", founder, {
          kind: "WORKSHOP",
          title: "Admin view workshop",
          startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
          durationMinutes: 60,
          mode: "ONLINE",
          onlineLink: "https://meet.example.org/secret-room",
          capacity: 5,
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("lists groups with moderators, members and open reports", async () => {
    await api
      .post("reports", member, {
        targetType: "GROUP",
        targetId: groupId,
        reasonCode: "SCAM",
        description: "The group asks for membership fees by bKash.",
      })
      .expect(201);
    const list = await admin.groupList(
      { q: groupName } as never,
      actor,
      context,
    );
    expect(list.items).toEqual([
      expect.objectContaining({
        id: groupId,
        memberCount: 2,
        moderators: [expect.objectContaining({ userId: founder.id })],
        openReports: 1,
        status: "ACTIVE",
      }),
    ]);
  });

  it("lists sessions without their private links", async () => {
    const list = await admin.sessionList(
      { kind: "WORKSHOP" } as never,
      actor,
      context,
    );
    const row = list.items.find(
      (item: { id: string }) => item.id === sessionId,
    );
    expect(row).toMatchObject({
      title: "Admin view workshop",
      host: { userId: founder.id },
    });
    expect(JSON.stringify(list)).not.toContain("secret-room");
  });

  it("appoints and removes an ambassador (badge follows), audited", async () => {
    await admin.setRole(
      groupId,
      member.id,
      { role: "AMBASSADOR", reason: "Active organiser in the area." },
      actor,
      context,
    );
    const ambassadors = await admin.ambassadors(actor, context);
    expect(ambassadors.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: member.id,
          groups: [expect.objectContaining({ id: groupId })],
        }),
      ]),
    );
    const badges = async () =>
      (await api.get("me/reputation", member).expect(200)).body.data.badges.map(
        (badge: { slug: string }) => badge.slug,
      );
    expect(await badges()).toContain("community-ambassador");
    await admin.setRole(
      groupId,
      member.id,
      { role: "MEMBER", reason: "Stepped down from organising." },
      actor,
      context,
    );
    expect(await badges()).not.toContain("community-ambassador");
    await expect(
      admin.setRole(
        groupId,
        founder.id,
        { role: "MEMBER", reason: "Demoting the only moderator." },
        actor,
        context,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "LAST_MODERATOR" }),
    });
    expect(
      await api.db.auditLog.count({
        where: { action: "ADMIN_COMMUNITY_ROLE_CHANGED", entity_id: groupId },
      }),
    ).toBe(2);
  });

  it("hides a reported group and session through the report queue", async () => {
    const groupReport = await api.db.report.findFirstOrThrow({
      where: { target_type: "GROUP", target_id: groupId },
    });
    await moderation.decide(
      groupReport.id,
      {
        status: ReportStatus.ACTIONED,
        reason: "Fee collection outside KAAJ confirmed.",
        hideContent: true,
      },
      actor,
      context,
    );
    await api.get(`community/groups/${groupId}`, member).expect(404);
    const hidden = await admin.groupList(
      { status: "HIDDEN" } as never,
      actor,
      context,
    );
    expect(hidden.items.map((item: { id: string }) => item.id)).toContain(
      groupId,
    );

    await moderation.setContentHidden(
      "SESSION",
      sessionId,
      true,
      "Off-platform payment requested.",
      actor,
      context,
    );
    const sessions = await admin.sessionList(
      { hidden: "true" } as never,
      actor,
      context,
    );
    expect(sessions.items.map((item: { id: string }) => item.id)).toContain(
      sessionId,
    );
    // The host still sees it, marked.
    const own = await api.get(`sessions/${sessionId}`, founder).expect(200);
    expect(own.body.data.hiddenReason).toBe("Off-platform payment requested.");
  });

  it("keeps the admin routes behind the admin session", async () => {
    await api.get("admin/community/groups", founder).expect(401);
    await api.get("admin/sessions", founder).expect(401);
  });
});
