import { Gender, MentorStatus, RoleMode, TrustLevel } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R1 / API-9: women-only spaces are for women whose identity is verified,
 * and a verified person's gender no longer changes by a profile edit.
 */
databaseDescribe("women-only spaces need a verified woman (real HTTP)", () => {
  let api: HttpHarness;
  let founder: Actor;
  let groupId: string;
  let locationId: string;

  const profileBody = (gender: Gender) => ({
    displayName: "Rina Begum",
    gender,
  });

  beforeAll(async () => {
    api = await HttpHarness.start();
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
    founder = await api.actor([RoleMode.WORKER, RoleMode.MENTOR], {
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.FEMALE },
    });
    await api.db.profile.update({
      where: { user_id: founder.id },
      data: { mentor_status: MentorStatus.APPROVED },
    });
    groupId = (
      await api
        .post("community/groups", founder, {
          name: "Women weavers",
          description: "Weavers sharing orders and prices.",
          locationId,
          womenOnly: true,
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses a self-declared woman without identity verification", async () => {
    const phoneOnly = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
      profile: { gender: Gender.MALE },
    });
    // Before verification the profile field can still be edited...
    await api
      .put("profiles/me", phoneOnly, profileBody(Gender.FEMALE))
      .expect(200);
    // ...but it no longer opens a women-only space.
    const refused = await api
      .post(`community/groups/${groupId}/join`, phoneOnly)
      .expect(409);
    expect(refused.body.error.code).toBe("IDENTITY_REQUIRED");
    expect(refused.body.error.messageKey).toBe(
      "error.women_only.identity_required",
    );
  });

  it("still lets a verified woman ask to join", async () => {
    const woman = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.FEMALE },
    });
    await api.post(`community/groups/${groupId}/join`, woman).expect(201);
  });

  it("does not add an unverified woman by invitation", async () => {
    const phoneOnly = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
      profile: { gender: Gender.FEMALE },
    });
    await api
      .post(`community/groups/${groupId}/members`, founder, {
        userIds: [phoneOnly.id],
      })
      .expect(201);
    expect(
      await api.db.communityGroupMember.count({
        where: { group_id: groupId, user_id: phoneOnly.id },
      }),
    ).toBe(0);
  });

  it("refuses an unverified woman's RSVP to a women-only session", async () => {
    const session = await api
      .post(`community/groups/${groupId}/sessions`, founder, {
        kind: "GROUP_DISCUSSION",
        title: "Pricing saris",
        description: "How we price our work.",
        startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
        durationMinutes: 60,
        mode: "ONLINE",
        onlineLink: "https://meet.example.org/saris",
        capacity: 10,
      })
      .expect(201);
    const id = session.body.data.id;
    await api.post(`sessions/${id}/publish`, founder).expect(201);
    const phoneOnly = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.PHONE,
      profile: { gender: Gender.FEMALE },
    });
    // A member from before this rule.
    await api.db.communityGroupMember.create({
      data: {
        group_id: groupId,
        user_id: phoneOnly.id,
        role: "MEMBER",
        status: "ACTIVE",
        joined_at: new Date(),
      },
    });
    const refused = await api
      .post(`sessions/${id}/rsvp`, phoneOnly)
      .expect(409);
    expect(refused.body.error.code).toBe("IDENTITY_REQUIRED");
  });

  it("locks gender once identity is verified", async () => {
    const verified = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.MALE },
    });
    const locked = await api
      .put("profiles/me", verified, profileBody(Gender.FEMALE))
      .expect(409);
    expect(locked.body.error.code).toBe("GENDER_LOCKED");
    // Other edits, and repeating the same gender, still work.
    await api
      .put("profiles/me", verified, profileBody(Gender.MALE))
      .expect(200);
    await api
      .put("profiles/me", verified, { displayName: "Rina Begum" })
      .expect(200);
    const row = await api.db.profile.findUniqueOrThrow({
      where: { user_id: verified.id },
    });
    expect(row.gender).toBe(Gender.MALE);
  });
});
