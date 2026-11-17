import { Gender, Prisma, RoleMode, TrustLevel } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const VENUE = { lat: 24.3745, lng: 88.6042 };

/** P3.5: group sessions and events — RSVP, waitlist and location check-in. */
databaseDescribe("group sessions and events (real HTTP)", () => {
  let api: HttpHarness;
  let host: Actor;
  let first: Actor;
  let second: Actor;
  let third: Actor;
  let outsider: Actor;
  let groupId: string;
  let sessionId: string;
  let locationId: string;

  const groupSession = (as: Actor, extra: object = {}) =>
    api.post(`community/groups/${groupId}/sessions`, as, {
      kind: "EVENT",
      title: "Tailors' meetup",
      startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      durationMinutes: 120,
      mode: "IN_PERSON",
      locationId,
      venueLat: VENUE.lat,
      venueLng: VENUE.lng,
      capacity: 1,
      ...extra,
    });
  const checkIn = (as: Actor, extra: object = {}) =>
    api.post(`sessions/${sessionId}/check-in`, as, {
      lat: VENUE.lat + 0.0005,
      lng: VENUE.lng,
      accuracyM: 20,
      consentGranted: true,
      consentVersion: "location-checkin-v1",
      ...extra,
    });

  // The check-in flag is global: remember it and put it back afterwards.
  let flagBefore: { is_enabled: boolean; rollout_percent: number } | null;

  beforeAll(async () => {
    api = await HttpHarness.start();
    flagBefore = await api.db.featureFlag.findUnique({
      where: { key: "checkin_enabled" },
      select: { is_enabled: true, rollout_percent: true },
    });
    await api.db.featureFlag.upsert({
      where: { key: "checkin_enabled" },
      update: { is_enabled: true, rollout_percent: 100 },
      create: {
        key: "checkin_enabled",
        is_enabled: true,
        rollout_percent: 100,
      },
    });
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
    host = await api.actor([RoleMode.WORKER], {
      displayName: "Sumi Akter",
      trust: TrustLevel.IDENTITY,
      profile: { gender: Gender.FEMALE },
    });
    first = await api.actor([RoleMode.WORKER]);
    second = await api.actor([RoleMode.WORKER]);
    third = await api.actor([RoleMode.WORKER]);
    outsider = await api.actor([RoleMode.WORKER]);
    groupId = (
      await api
        .post("community/groups", host, {
          name: "Tailors of Boalia",
          locationId,
        })
        .expect(201)
    ).body.data.id;
    for (const actor of [first, second, third])
      await api.post(`community/groups/${groupId}/join`, actor).expect(201);
  });

  afterAll(async () => {
    if (api)
      await (flagBefore
        ? api.db.featureFlag.update({
            where: { key: "checkin_enabled" },
            data: flagBefore,
          })
        : api.db.featureFlag.delete({ where: { key: "checkin_enabled" } }));
    await api?.close();
  });

  it("is created by moderators or ambassadors, announced to members on publish", async () => {
    await groupSession(first).expect(404);
    const created = await groupSession(host).expect(201);
    sessionId = created.body.data.id;
    expect(created.body.data).toMatchObject({
      status: "DRAFT",
      groupId,
      subject: { type: "GROUP", id: groupId },
      area: { id: locationId },
    });
    // The venue pin is never returned.
    expect(JSON.stringify(created.body)).not.toMatch(/venue|"lat"|"lng"/);
    // A draft is the host's alone.
    await api.get(`sessions/${sessionId}`, first).expect(404);
    await api.post(`sessions/${sessionId}/publish`, host).expect(201);
    expect(
      await api.db.notification.count({
        where: { user_id: first.id, type: "SESSION_ANNOUNCED" },
      }),
    ).toBe(1);
    const listed = await api
      .get(`community/groups/${groupId}/sessions`, first)
      .expect(200);
    expect(
      listed.body.data.items.map((item: { id: string }) => item.id),
    ).toContain(sessionId);
  });

  it("SECURITY: non-members get 404 on group sessions", async () => {
    await api.get(`community/groups/${groupId}/sessions`, outsider).expect(404);
    await api.get(`sessions/${sessionId}`, outsider).expect(404);
    await api.post(`sessions/${sessionId}/rsvp`, outsider).expect(404);
    await checkIn(outsider).expect(404);
  });

  it("gives places in order, then a waitlist that moves up", async () => {
    const one = await api.post(`sessions/${sessionId}/rsvp`, first).expect(201);
    expect(one.body.data).toMatchObject({
      myStatus: "ACCEPTED",
      placesTaken: 1,
    });
    const two = await api
      .post(`sessions/${sessionId}/rsvp`, second)
      .expect(201);
    expect(two.body.data).toMatchObject({
      myStatus: "WAITLISTED",
      waitlistPosition: 1,
    });
    const three = await api
      .post(`sessions/${sessionId}/rsvp`, third)
      .expect(201);
    expect(three.body.data).toMatchObject({
      myStatus: "WAITLISTED",
      waitlistPosition: 2,
    });
    // RSVP twice changes nothing.
    await api.post(`sessions/${sessionId}/rsvp`, second).expect(201);

    await api.post(`sessions/${sessionId}/leave`, first).expect(201);
    const promoted = await api.get(`sessions/${sessionId}`, second).expect(200);
    expect(promoted.body.data).toMatchObject({
      myStatus: "ACCEPTED",
      waitlistPosition: null,
    });
    expect(
      await api.db.notification.count({
        where: { user_id: second.id, type: "SESSION_WAITLIST_PROMOTED" },
      }),
    ).toBe(1);
    expect(
      (await api.get(`sessions/${sessionId}`, third).expect(200)).body.data
        .waitlistPosition,
    ).toBe(1);

    // More places: the waitlist fills them.
    await api.patch(`sessions/${sessionId}`, host, { capacity: 2 }).expect(200);
    expect(
      (await api.get(`sessions/${sessionId}`, third).expect(200)).body.data
        .myStatus,
    ).toBe("ACCEPTED");
  });

  it("SECURITY: blocked people can't join each other's sessions", async () => {
    const blocker = await api.actor([RoleMode.WORKER]);
    await api.post(`community/groups/${groupId}/join`, blocker).expect(201);
    await api.db.userBlock.create({
      data: { blocker_user_id: blocker.id, blocked_user_id: host.id },
    });
    await api.get(`sessions/${sessionId}`, blocker).expect(404);
    await api.post(`sessions/${sessionId}/rsvp`, blocker).expect(404);
    const listed = await api
      .get(`community/groups/${groupId}/sessions`, blocker)
      .expect(200);
    expect(
      listed.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(sessionId);
  });

  describe("location check-in", () => {
    beforeAll(async () => {
      await api.db.session.update({
        where: { id: sessionId },
        data: { starts_at: new Date(Date.now() + 30 * 60_000) },
      });
    });

    it("needs current explicit consent and good accuracy", async () => {
      await checkIn(second, { consentGranted: false }).expect(422);
      await checkIn(second, { consentVersion: "old-version" }).expect(422);
      await checkIn(second, { accuracyM: 900 }).expect(422);
    });

    it("refuses someone outside the venue's geofence", async () => {
      await checkIn(second, { lat: VENUE.lat + 0.05 }).expect(422);
    });

    it("marks attendance and keeps only the distance", async () => {
      const done = await checkIn(second).expect(201);
      expect(done.body.data).toMatchObject({
        myStatus: "ATTENDED",
        myCheckedInAt: expect.any(String),
      });
      const row = await api.db.sessionParticipant.findUniqueOrThrow({
        where: {
          session_id_user_id: { session_id: sessionId, user_id: second.id },
        },
      });
      expect(row).toMatchObject({
        checkin_consent_version: "location-checkin-v1",
        checkin_distance_m: expect.any(Number),
      });
      expect(row.checkin_distance_m!).toBeLessThan(300);
      expect(Object.keys(row).some((key) => /lat|lng/.test(key))).toBe(false);
      // Once only; and the waitlisted or the host can't.
      await checkIn(second).expect(409);
      await checkIn(host).expect(409);
    });

    it("only opens an hour before the start", async () => {
      const later = (
        await groupSession(host, {
          title: "Next month",
          startsAt: new Date(Date.now() + 20 * 86_400_000).toISOString(),
          capacity: 5,
        }).expect(201)
      ).body.data.id;
      await api.post(`sessions/${later}/publish`, host).expect(201);
      await api.post(`sessions/${later}/rsvp`, first).expect(201);
      const early = await api
        .post(`sessions/${later}/check-in`, first, {
          lat: VENUE.lat,
          lng: VENUE.lng,
          accuracyM: 20,
          consentGranted: true,
          consentVersion: "location-checkin-v1",
        })
        .expect(409);
      expect(early.body.error.code).toBe("SESSION_DETAILS_INVALID");
    });
  });

  it("makes a women-only group's sessions women-only", async () => {
    const womenGroup = (
      await api
        .post("community/groups", host, {
          name: "Women tailors circle",
          womenOnly: true,
        })
        .expect(201)
    ).body.data.id;
    const created = await api
      .post(`community/groups/${womenGroup}/sessions`, host, {
        kind: "GROUP_DISCUSSION",
        title: "Pricing chat",
        startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        durationMinutes: 60,
        mode: "IN_APP_CHAT",
        capacity: 10,
      })
      .expect(201);
    expect(created.body.data.womenOnly).toBe(true);
  });

  it("keeps a group session tied to its group in the database", async () => {
    await expect(
      api.db.session.update({
        where: { id: sessionId },
        data: { subject_type: null, subject_id: null },
      }),
    ).rejects.toThrow(/sessions_group_check/);
    await expect(
      api.db.session.update({
        where: { id: sessionId },
        data: { venue_lng: new Prisma.Decimal(0), venue_lat: null },
      }),
    ).rejects.toThrow(/sessions_group_check/);
  });
});
