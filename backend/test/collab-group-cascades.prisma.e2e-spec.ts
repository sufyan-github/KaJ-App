import { randomUUID } from "node:crypto";
import { Gender, RoleMode, TrustLevel } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R2 / W10 (D-6): withdrawing an accepted collaboration closes its chat;
 * leaving or being removed from a group gives up places in its sessions
 * (the waitlist moves up) and the group's sessions.
 */
databaseDescribe("collaboration and group exits cascade (real HTTP)", () => {
  let api: HttpHarness;
  let areaId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    areaId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("closes the chat when an accepted collaboration is withdrawn", async () => {
    const owner = await api.actor([RoleMode.BUSINESS]);
    const partner = await api.actor([RoleMode.BUSINESS]);
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    const businessId = (
      await api
        .post("businesses", owner, {
          name: `Cascade kitchen ${randomUUID().slice(0, 6)}`,
          categoryId: sector.id,
          locationId: areaId,
          isPublic: true,
          seekingPartners: true,
        })
        .expect(201)
    ).body.data.id;
    const requestId = (
      await api
        .post("collaboration-requests", partner, {
          subjectType: "BUSINESS",
          subjectId: businessId,
          message: "We could share deliveries.",
        })
        .expect(201)
    ).body.data.id;
    const accepted = await api
      .post(`collaboration-requests/${requestId}/accept`, owner)
      .expect(201);
    const conversationId = accepted.body.data.conversationId;
    await api
      .get(`conversations/${conversationId}/messages`, partner)
      .expect(200);

    await api
      .post(`collaboration-requests/${requestId}/withdraw`, partner, {})
      .expect(201);
    const read = await api.get(
      `conversations/${conversationId}/messages`,
      owner,
    );
    expect([403, 404]).toContain(read.status);
    const send = await api.post(
      `conversations/${conversationId}/messages`,
      owner,
      {
        type: "TEXT",
        body: "Still there?",
        clientNonce: randomUUID(),
      },
    );
    expect([403, 404]).toContain(send.status);
  });

  it("gives up a leaver's session place, promotes the waitlist and hides the session", async () => {
    const founder = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.FEMALE },
    });
    const groupId = (
      await api
        .post("community/groups", founder, {
          name: `Cascade group ${randomUUID().slice(0, 6)}`,
          description: "A group used only by the W10 test.",
          locationId: areaId,
        })
        .expect(201)
    ).body.data.id;
    const leaver = await api.actor([RoleMode.WORKER]);
    const waiting = await api.actor([RoleMode.WORKER]);
    for (const member of [leaver, waiting])
      await api.post(`community/groups/${groupId}/join`, member).expect(201);
    const sessionId = (
      await api
        .post(`community/groups/${groupId}/sessions`, founder, {
          kind: "GROUP_DISCUSSION",
          title: "Cascade meetup",
          description: "One place only.",
          startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
          durationMinutes: 60,
          mode: "ONLINE",
          onlineLink: "https://meet.example.org/cascade",
          capacity: 1,
        })
        .expect(201)
    ).body.data.id;
    await api.post(`sessions/${sessionId}/publish`, founder).expect(201);
    await api.post(`sessions/${sessionId}/rsvp`, leaver).expect(201);
    const queued = await api
      .post(`sessions/${sessionId}/rsvp`, waiting)
      .expect(201);
    expect(queued.body.data.myStatus).toBe("WAITLISTED");

    await api.post(`community/groups/${groupId}/leave`, leaver).expect(201);
    const statusOf = async (user: Actor) =>
      (
        await api.db.sessionParticipant.findFirstOrThrow({
          where: { session_id: sessionId, user_id: user.id },
        })
      ).status;
    expect(await statusOf(leaver)).toBe("DECLINED");
    expect(await statusOf(waiting)).toBe("ACCEPTED");
    await api.get(`sessions/${sessionId}`, leaver).expect(404);
  });

  it("does the same when a moderator removes the member", async () => {
    const founder = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
    });
    const groupId = (
      await api
        .post("community/groups", founder, {
          name: `Removal group ${randomUUID().slice(0, 6)}`,
          description: "A group used only by the W10 test.",
          locationId: areaId,
        })
        .expect(201)
    ).body.data.id;
    const member = await api.actor([RoleMode.WORKER]);
    await api.post(`community/groups/${groupId}/join`, member).expect(201);
    const sessionId = (
      await api
        .post(`community/groups/${groupId}/sessions`, founder, {
          kind: "WORKSHOP",
          title: "Removal workshop",
          description: "For the W10 test.",
          startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
          durationMinutes: 60,
          mode: "ONLINE",
          onlineLink: "https://meet.example.org/removal",
          capacity: 5,
        })
        .expect(201)
    ).body.data.id;
    await api.post(`sessions/${sessionId}/publish`, founder).expect(201);
    await api.post(`sessions/${sessionId}/rsvp`, member).expect(201);

    await api
      .delete(`community/groups/${groupId}/members/${member.id}`, founder)
      .expect(200);
    expect(
      (
        await api.db.sessionParticipant.findFirstOrThrow({
          where: { session_id: sessionId, user_id: member.id },
        })
      ).status,
    ).toBe("DECLINED");
    await api.get(`sessions/${sessionId}`, member).expect(404);
  });
});
