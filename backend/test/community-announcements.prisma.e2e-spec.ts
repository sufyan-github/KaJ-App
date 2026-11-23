import { randomUUID } from "node:crypto";
import { AdminRole, RoleMode, TrustLevel } from "@prisma/client";

import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P3.6: group announcements, ambassadors and platform announcements. */
databaseDescribe("announcements and ambassadors (real HTTP)", () => {
  let api: HttpHarness;
  let moderator: Actor;
  let ambassador: Actor;
  let member: Actor;
  let blocker: Actor;
  let outsider: Actor;
  let groupId: string;
  let areaId: string;

  const badges = async (as: Actor) =>
    (await api.get("me/reputation", as).expect(200)).body.data.badges.map(
      (badge: { slug: string }) => badge.slug,
    );

  beforeAll(async () => {
    api = await HttpHarness.start();
    areaId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
    moderator = await api.actor([RoleMode.WORKER], {
      displayName: "Rehana Parvin",
      trust: TrustLevel.IDENTITY,
    });
    ambassador = await api.actor([RoleMode.WORKER], {
      displayName: "Tuhin Ahmed",
    });
    member = await api.actor([RoleMode.WORKER], {
      profile: { primary_location_id: areaId },
    });
    blocker = await api.actor([RoleMode.WORKER]);
    outsider = await api.actor([RoleMode.WORKER]);
    groupId = (
      await api
        .post("community/groups", moderator, { name: "Boalia electricians" })
        .expect(201)
    ).body.data.id;
    for (const actor of [ambassador, member, blocker])
      await api.post(`community/groups/${groupId}/join`, actor).expect(201);
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("ambassadors", () => {
    it("get the badge with the role, and lose it with the role", async () => {
      expect(await badges(ambassador)).not.toContain("community-ambassador");
      await api
        .patch(
          `community/groups/${groupId}/members/${ambassador.id}`,
          moderator,
          {
            role: "AMBASSADOR",
          },
        )
        .expect(200);
      expect(await badges(ambassador)).toContain("community-ambassador");
      await api
        .patch(
          `community/groups/${groupId}/members/${ambassador.id}`,
          moderator,
          {
            role: "MEMBER",
          },
        )
        .expect(200);
      expect(await badges(ambassador)).not.toContain("community-ambassador");
      await api
        .patch(
          `community/groups/${groupId}/members/${ambassador.id}`,
          moderator,
          {
            role: "AMBASSADOR",
          },
        )
        .expect(200);
      expect(await badges(ambassador)).toContain("community-ambassador");
    });
  });

  describe("group announcements", () => {
    it("are posted by moderators and ambassadors only", async () => {
      await api
        .post(`community/groups/${groupId}/announcements`, member, {
          body: "Not allowed",
        })
        .expect(404);
      await api
        .post(`community/groups/${groupId}/announcements`, outsider, {
          body: "Not allowed",
        })
        .expect(404);
      await api.post(`users/${moderator.id}/block`, blocker).expect(201);
      const posted = await api
        .post(`community/groups/${groupId}/announcements`, moderator, {
          body: "Training on safe wiring this Friday at the union office.",
        })
        .expect(201);
      expect(posted.body.data.items[0]).toMatchObject({
        body: "Training on safe wiring this Friday at the union office.",
        postedBy: { userId: moderator.id, displayName: "Rehana P." },
      });
      await api
        .post(`community/groups/${groupId}/announcements`, ambassador, {
          body: "Bring your own tester.",
        })
        .expect(201);
    });

    it("reach members by notification and in the group chat, not blocked people", async () => {
      expect(
        await api.db.notification.count({
          where: { user_id: member.id, type: "COMMUNITY_ANNOUNCEMENT" },
        }),
      ).toBe(2);
      expect(
        await api.db.notification.count({
          where: { user_id: moderator.id, type: "COMMUNITY_ANNOUNCEMENT" },
        }),
      ).toBe(1);
      expect(
        await api.db.notification.count({
          where: { user_id: blocker.id, type: "COMMUNITY_ANNOUNCEMENT" },
        }),
      ).toBe(1); // the ambassador's, not the blocked moderator's
      const forBlocker = await api
        .get(`community/groups/${groupId}/announcements`, blocker)
        .expect(200);
      expect(
        forBlocker.body.data.items.map((item: { body: string }) => item.body),
      ).toEqual(["Bring your own tester."]);
      const chat = await api
        .post(`community/groups/${groupId}/chat`, member)
        .expect(201);
      const messages = await api
        .get(`conversations/${chat.body.data.conversationId}/messages`, member)
        .expect(200);
      expect(messages.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: "SYSTEM",
            senderUserId: moderator.id,
          }),
        ]),
      );
    });

    it("SECURITY: are for members only", async () => {
      await api
        .get(`community/groups/${groupId}/announcements`, outsider)
        .expect(404);
    });
  });

  it("targets platform announcements by area and by group", async () => {
    const ops = api.app.get(AdminOpsService);
    const admin = {
      userId: (await api.actor([RoleMode.CUSTOMER])).id,
      email: "announcer@kaj.test",
      role: AdminRole.ADMIN,
      sessionId: randomUUID(),
    };
    const context = { ip: "127.0.0.1", ua: "announcements-test" };
    const byGroup = await ops.campaignDryRun(
      {
        name: "Group notice",
        title: "Notice",
        body: "Hello",
        segment: { communityGroupId: groupId },
        throttlePerMinute: 100,
      },
      admin,
      context,
    );
    expect(byGroup.audienceCount).toBe(4);
    const byArea = await ops.campaignDryRun(
      {
        name: "Area notice",
        title: "Notice",
        body: "Hello",
        segment: { locationId: areaId },
        throttlePerMinute: 100,
      },
      admin,
      context,
    );
    expect(byArea.audienceCount).toBeGreaterThanOrEqual(1);
    const sent = await ops.sendCampaign(
      {
        name: "Group notice",
        title: "Notice",
        body: "Hello",
        segment: { communityGroupId: groupId },
        throttlePerMinute: 100,
        reason: "Announcement to the group's members.",
      },
      admin,
      context,
    );
    expect(sent).toMatchObject({ audienceCount: 4, sentCount: 4 });
    expect(
      await api.db.notification.count({
        where: { user_id: member.id, type: "ADMIN_CAMPAIGN" },
      }),
    ).toBe(1);
  });
});
