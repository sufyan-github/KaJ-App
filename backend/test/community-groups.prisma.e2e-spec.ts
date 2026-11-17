import { Gender, RoleMode, TrustLevel } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/** P3.4: community groups, membership, member lists and group chat. */
databaseDescribe("community groups (real HTTP)", () => {
  let api: HttpHarness;
  let founder: Actor;
  let member: Actor;
  let outsider: Actor;
  let publicId: string;
  let privateId: string;
  let locationId: string;

  const group = (as: Actor, extra: object = {}) =>
    api.post("community/groups", as, {
      name: "Rajshahi tailors",
      description: "Tailors in Rajshahi sharing work and tips.",
      locationId,
      ...extra,
    });
  const memberIds = async (as: Actor, id: string) =>
    (
      await api.get(`community/groups/${id}/members`, as).expect(200)
    ).body.data.items.map((item: { userId: string }) => item.userId);

  beforeAll(async () => {
    api = await HttpHarness.start();
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
    founder = await api.actor([RoleMode.WORKER], {
      displayName: "Sumi Akter",
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.FEMALE },
    });
    member = await api.actor([RoleMode.WORKER], { displayName: "Babul Mia" });
    outsider = await api.actor([RoleMode.WORKER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("needs identity verification to start a group", async () => {
    const phoneOnly = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
    });
    const refused = await group(phoneOnly).expect(409);
    expect(refused.body.error.code).toBe("IDENTITY_REQUIRED");
  });

  describe("public groups", () => {
    it("are found, seen and joined by anyone", async () => {
      const created = await group(founder).expect(201);
      publicId = created.body.data.id;
      expect(created.body.data).toMatchObject({
        visibility: "PUBLIC",
        memberCount: 1,
        myMembership: { role: "MODERATOR", status: "ACTIVE" },
        area: { id: locationId },
      });
      const found = await api
        .get("community/groups?q=tailors", outsider)
        .expect(200);
      expect(
        found.body.data.items.map((item: { id: string }) => item.id),
      ).toContain(publicId);
      await api.get(`community/groups/${publicId}`, outsider).expect(200);
      const joined = await api
        .post(`community/groups/${publicId}/join`, member)
        .expect(201);
      expect(joined.body.data).toMatchObject({
        memberCount: 2,
        myMembership: { role: "MEMBER", status: "ACTIVE" },
      });
      await api.post(`community/groups/${publicId}/join`, member).expect(409);
    });

    it("SECURITY: shows the member list to members only", async () => {
      expect(await memberIds(member, publicId)).toEqual(
        expect.arrayContaining([founder.id, member.id]),
      );
      await api
        .get(`community/groups/${publicId}/members`, outsider)
        .expect(404);
      // Pending requests: moderators only.
      await api
        .get(`community/groups/${publicId}/members?status=PENDING`, member)
        .expect(404);
    });

    it("SECURITY: blocked people don't see each other in member lists", async () => {
      const blocker = await api.actor([RoleMode.WORKER]);
      await api.post(`community/groups/${publicId}/join`, blocker).expect(201);
      await api.post(`users/${member.id}/block`, blocker).expect(201);
      expect(await memberIds(blocker, publicId)).not.toContain(member.id);
      expect(await memberIds(member, publicId)).not.toContain(blocker.id);
      expect(await memberIds(founder, publicId)).toEqual(
        expect.arrayContaining([member.id, blocker.id]),
      );
    });

    it("keeps a moderator, changes roles and removes people for good", async () => {
      const last = await api
        .post(`community/groups/${publicId}/leave`, founder)
        .expect(409);
      expect(last.body.error.code).toBe("LAST_MODERATOR");
      await api
        .patch(`community/groups/${publicId}/members/${member.id}`, founder, {
          role: "AMBASSADOR",
        })
        .expect(200);
      await api
        .patch(`community/groups/${publicId}/members/${founder.id}`, member, {
          role: "MEMBER",
        })
        .expect(404);
      const troll = await api.actor([RoleMode.WORKER]);
      await api.post(`community/groups/${publicId}/join`, troll).expect(201);
      await api
        .delete(`community/groups/${publicId}/members/${troll.id}`, founder)
        .expect(200);
      const again = await api
        .post(`community/groups/${publicId}/join`, troll)
        .expect(409);
      expect(again.body.error.code).toBe("REMOVED_FROM_GROUP");
      await api.get(`community/groups/${publicId}/members`, troll).expect(404);
    });

    it("has a group chat for active members that follows membership", async () => {
      const chat = await api
        .post(`community/groups/${publicId}/chat`, member)
        .expect(201);
      const conversationId = chat.body.data.conversationId;
      await api
        .get(`conversations/${conversationId}/messages`, founder)
        .expect(200);
      await api.post(`community/groups/${publicId}/chat`, outsider).expect(404);
      const leaver = await api.actor([RoleMode.WORKER]);
      await api.post(`community/groups/${publicId}/join`, leaver).expect(201);
      await api
        .get(`conversations/${conversationId}/messages`, leaver)
        .expect(200);
      await api.post(`community/groups/${publicId}/leave`, leaver).expect(201);
      await api
        .get(`conversations/${conversationId}/messages`, leaver)
        .expect(404);
    });
  });

  describe("private groups", () => {
    let invitee: Actor;

    beforeAll(async () => {
      invitee = await api.actor([RoleMode.WORKER]);
    });

    it("SECURITY: are invisible to non-members on every route", async () => {
      privateId = (
        await group(founder, {
          name: "Tailors' savings circle",
          visibility: "PRIVATE",
        }).expect(201)
      ).body.data.id;
      const found = await api
        .get("community/groups?q=savings", outsider)
        .expect(200);
      expect(
        found.body.data.items.map((item: { id: string }) => item.id),
      ).not.toContain(privateId);
      for (const call of [
        () => api.get(`community/groups/${privateId}`, outsider),
        () => api.get(`community/groups/${privateId}/members`, outsider),
        () => api.post(`community/groups/${privateId}/join`, outsider),
        () => api.post(`community/groups/${privateId}/chat`, outsider),
        () =>
          api.patch(`community/groups/${privateId}`, outsider, {
            name: "Taken",
          }),
        () =>
          api.post(`community/groups/${privateId}/members`, outsider, {
            userIds: [outsider.id],
          }),
        () =>
          api.post("reports", outsider, {
            targetType: "GROUP",
            targetId: privateId,
            reasonCode: "SCAM",
            description: "Probing for a private group here.",
          }),
      ])
        expect((await call()).status).toBe(404);
    });

    it("are joined by invitation", async () => {
      const invited = await api
        .post(`community/groups/${privateId}/members`, founder, {
          userIds: [invitee.id],
        })
        .expect(201);
      expect(invited.body.data.invited).toEqual([invitee.id]);
      const seen = await api
        .get(`community/groups/${privateId}`, invitee)
        .expect(200);
      expect(seen.body.data.myMembership).toMatchObject({
        status: "PENDING",
        invited: true,
      });
      // Invited isn't a member yet: no member list.
      await api
        .get(`community/groups/${privateId}/members`, invitee)
        .expect(404);
      await api.post(`community/groups/${privateId}/join`, invitee).expect(201);
      expect(await memberIds(invitee, privateId)).toContain(invitee.id);
      const mine = await api.get("me/community/groups", invitee).expect(200);
      expect(
        mine.body.data.items.map((item: { id: string }) => item.id),
      ).toContain(privateId);
    });
  });

  describe("women-only groups (opt-in)", () => {
    let womenId: string;

    it("are started by women, joined by women on a moderator's approval", async () => {
      const man = await api.actor([RoleMode.WORKER], {
        trust: TrustLevel.IDENTITY,
        profile: { gender: Gender.MALE },
      });
      const refused = await group(man, {
        name: "Women tailors",
        womenOnly: true,
      }).expect(409);
      expect(refused.body.error.code).toBe("WOMEN_ONLY");
      womenId = (
        await group(founder, { name: "Women tailors", womenOnly: true }).expect(
          201,
        )
      ).body.data.id;
      const noMen = await api
        .post(`community/groups/${womenId}/join`, man)
        .expect(409);
      expect(noMen.body.error.code).toBe("WOMEN_ONLY");
      const woman = await api.actor([RoleMode.WORKER], {
        profile: { gender: Gender.FEMALE },
      });
      const asked = await api
        .post(`community/groups/${womenId}/join`, woman)
        .expect(201);
      expect(asked.body.data.myMembership).toMatchObject({
        status: "PENDING",
        invited: false,
      });
      const pending = await api
        .get(`community/groups/${womenId}/members?status=PENDING`, founder)
        .expect(200);
      expect(pending.body.data.items).toEqual([
        expect.objectContaining({ userId: woman.id, kind: "REQUEST" }),
      ]);
      await api
        .post(
          `community/groups/${womenId}/members/${woman.id}/approve`,
          founder,
        )
        .expect(201);
      expect(await memberIds(woman, womenId)).toContain(woman.id);
      const filtered = await api
        .get("community/groups?womenOnly=true", woman)
        .expect(200);
      expect(
        filtered.body.data.items.map((item: { id: string }) => item.id),
      ).toContain(womenId);
    });
  });

  it("hides a moderated group from everyone but its moderators", async () => {
    await api.db.communityGroup.update({
      where: { id: publicId },
      data: { hidden_at: new Date(), hidden_reason: "Spam" },
    });
    await api.get(`community/groups/${publicId}`, member).expect(404);
    expect(
      (await api.get(`community/groups/${publicId}`, founder).expect(200)).body
        .data.status,
    ).toBe("HIDDEN");
    await api.db.communityGroup.update({
      where: { id: publicId },
      data: { hidden_at: null, hidden_reason: null },
    });
  });

  it("caps groups started per person and keeps names sensible", async () => {
    const busy = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
    });
    for (let index = 0; index < 5; index += 1)
      await group(busy, { name: `Group number ${index}` }).expect(201);
    expect(
      (await group(busy, { name: "One too many" }).expect(409)).body.error.code,
    ).toBe("GROUP_LIMIT_REACHED");
    await expect(
      api.db.communityGroup.create({
        data: { created_by_user_id: busy.id, name: "  x " },
      }),
    ).rejects.toThrow(/community_groups_name_check/);
  });
});
