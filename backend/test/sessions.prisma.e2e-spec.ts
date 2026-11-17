import { Gender, MentorStatus, RoleMode } from "@prisma/client";

import { SessionsService } from "../src/modules/experts/sessions.service";
import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/** P3.2: consultations, hosted sessions, links, cash, attendance, feedback. */
databaseDescribe("sessions (real HTTP)", () => {
  let api: HttpHarness;
  let expert: Actor;
  let learner: Actor;
  let outsider: Actor;
  let locationId: string;

  const makeMentor = async (displayName: string, gender?: Gender) => {
    const actor = await api.actor([RoleMode.MENTOR, RoleMode.WORKER], {
      displayName,
      profile: gender ? { gender } : {},
    });
    await api.db.profile.update({
      where: { user_id: actor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    return actor;
  };
  /** A free hour of the expert's, 2–9 days ahead. */
  const freeHour = async (as: Actor, expertId: string, dayOffset = 2) => {
    const from = new Date(Date.now() + dayOffset * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    const slots = await api
      .get(
        `experts/${expertId}/slots?from=${from.toISOString()}&to=${to.toISOString()}`,
        as,
      )
      .expect(200);
    const slot = slots.body.data.slots.find(
      (item: { startsAt: string; endsAt: string }) =>
        new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime() >=
        3_600_000,
    );
    return new Date(slot.startsAt);
  };
  const workshop = (as: Actor, extra: object = {}) =>
    api.post("sessions", as, {
      kind: "WORKSHOP",
      title: "Pricing handmade crafts",
      description: "How to cost materials and time.",
      startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
      durationMinutes: 90,
      mode: "ONLINE",
      onlineLink: "https://meet.example.org/pricing-crafts",
      capacity: 2,
      ...extra,
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
    expert = await makeMentor("Farhana Rahman", Gender.FEMALE);
    learner = await api.actor([RoleMode.CUSTOMER], {
      displayName: "Jamal Uddin",
      profile: { gender: Gender.MALE },
    });
    outsider = await api.actor([RoleMode.WORKER]);
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  describe("consultations", () => {
    let sessionId: string;
    let startsAt: Date;

    it("shows an expert's free time and refuses non-experts and blocks", async () => {
      startsAt = await freeHour(learner, expert.id);
      expect(startsAt.getTime()).toBeGreaterThan(Date.now());
      const notExpert = await api.actor([RoleMode.WORKER]);
      const from = new Date(Date.now() + DAY).toISOString();
      const to = new Date(Date.now() + 3 * DAY).toISOString();
      await api
        .get(`experts/${notExpert.id}/slots?from=${from}&to=${to}`, learner)
        .expect(404);
      const blocker = await makeMentor("Blocking Mentor");
      await api.db.userBlock.create({
        data: { blocker_user_id: blocker.id, blocked_user_id: learner.id },
      });
      await api
        .get(`experts/${blocker.id}/slots?from=${from}&to=${to}`, learner)
        .expect(404);
    });

    it("books a consultation in the expert's free time; the expert confirms", async () => {
      const booked = await api
        .post("sessions/consultations", learner, {
          expertUserId: expert.id,
          startsAt: startsAt.toISOString(),
          durationMinutes: 45,
          mode: "IN_APP_CHAT",
          note: "Help me price my nakshi kantha.",
        })
        .expect(201);
      sessionId = booked.body.data.id;
      expect(booked.body.data).toMatchObject({
        kind: "CONSULTATION",
        status: "DRAFT",
        capacity: 1,
        myRole: "PARTICIPANT",
        myStatus: "ACCEPTED",
        host: { userId: expert.id },
        expert: { userId: expert.id },
        priceModel: "FREE",
      });
      // The same time is no longer free.
      const other = await api.actor([RoleMode.CUSTOMER]);
      const clash = await api
        .post("sessions/consultations", other, {
          expertUserId: expert.id,
          startsAt: startsAt.toISOString(),
          durationMinutes: 30,
          mode: "IN_APP_CHAT",
        })
        .expect(409);
      expect(clash.body.error.code).toBe("SLOT_UNAVAILABLE");

      const confirmed = await api
        .post(`sessions/${sessionId}/respond`, expert, { accept: true })
        .expect(201);
      expect(confirmed.body.data).toMatchObject({
        status: "SCHEDULED",
        myRole: "HOST",
      });
      expect(
        await api.db.notification.count({
          where: { user_id: learner.id, type: "SESSION_CONFIRMED" },
        }),
      ).toBe(1);
    });

    it("refuses a time outside the expert's availability", async () => {
      const far = new Date(Date.now() + 2 * DAY);
      // Rules are 08:00–22:00 Dhaka time (UTC+6): 18:00 UTC is midnight there.
      far.setUTCHours(18, 0, 0, 0);
      await api
        .post("sessions/consultations", learner, {
          expertUserId: expert.id,
          startsAt: far.toISOString(),
          durationMinutes: 30,
          mode: "IN_APP_CHAT",
        })
        .expect(409);
    });

    it("SECURITY: shows an online link only to confirmed people", async () => {
      const at = await freeHour(learner, expert.id, 4);
      const booked = await api
        .post("sessions/consultations", learner, {
          expertUserId: expert.id,
          startsAt: at.toISOString(),
          durationMinutes: 30,
          mode: "ONLINE",
        })
        .expect(201);
      const id = booked.body.data.id;
      const noLink = await api
        .post(`sessions/${id}/respond`, expert, { accept: true })
        .expect(409);
      expect(noLink.body.error.code).toBe("SESSION_DETAILS_INVALID");
      await api
        .post(`sessions/${id}/respond`, expert, {
          accept: true,
          onlineLink: "https://meet.example.org/farhana-jamal",
          priceModel: "CASH",
          pricePoisha: "50000",
        })
        .expect(201);
      const seen = await api.get(`sessions/${id}`, learner).expect(200);
      expect(seen.body.data).toMatchObject({
        onlineLink: "https://meet.example.org/farhana-jamal",
        priceModel: "CASH",
        pricePoisha: "50000",
      });
      await api.get(`sessions/${id}`, outsider).expect(404);
      // Leaving a consultation cancels it.
      const left = await api.post(`sessions/${id}/leave`, learner).expect(201);
      expect(left.body.data.status).toBe("CANCELLED");
    });

    it("lets the expert decline, which cancels the booking", async () => {
      const at = await freeHour(learner, expert.id, 6);
      const id = (
        await api
          .post("sessions/consultations", learner, {
            expertUserId: expert.id,
            startsAt: at.toISOString(),
            durationMinutes: 30,
            mode: "IN_PERSON",
            locationId,
          })
          .expect(201)
      ).body.data.id;
      const declined = await api
        .post(`sessions/${id}/respond`, expert, { accept: false })
        .expect(201);
      expect(declined.body.data.status).toBe("CANCELLED");
    });
  });

  describe("hosted sessions", () => {
    let host: Actor;
    let first: Actor;
    let second: Actor;
    let third: Actor;
    let blocked: Actor;
    let sessionId: string;

    beforeAll(async () => {
      host = await makeMentor("Nazma Akhter", Gender.FEMALE);
      first = await api.actor([RoleMode.WORKER], {
        displayName: "Ruma Khatun",
      });
      second = await api.actor([RoleMode.WORKER]);
      third = await api.actor([RoleMode.WORKER]);
      blocked = await api.actor([RoleMode.WORKER]);
      await api.db.userBlock.create({
        data: { blocker_user_id: host.id, blocked_user_id: blocked.id },
      });
    });

    it("only an approved mentor hosts", async () => {
      const refused = await workshop(learner).expect(403);
      expect(refused.body.error.code).toBe("MENTOR_APPROVAL_REQUIRED");
    });

    it("creates, invites (skipping blocked people), publishes", async () => {
      const created = await workshop(host).expect(201);
      sessionId = created.body.data.id;
      expect(created.body.data).toMatchObject({
        status: "DRAFT",
        myRole: "HOST",
        placesTaken: 0,
      });
      const invited = await api
        .post(`sessions/${sessionId}/invite`, host, {
          userIds: [first.id, second.id, third.id, blocked.id],
        })
        .expect(201);
      expect(invited.body.data.invited.sort()).toEqual(
        [first.id, second.id, third.id].sort(),
      );
      await api.post(`sessions/${sessionId}/publish`, host).expect(201);
      expect(
        await api.db.notification.count({
          where: { user_id: first.id, type: "SESSION_INVITE" },
        }),
      ).toBe(1);
      // SECURITY: the blocked person and strangers can't see it.
      await api.get(`sessions/${sessionId}`, blocked).expect(404);
      await api.get(`sessions/${sessionId}`, outsider).expect(404);
      await api
        .post(`sessions/${sessionId}/respond`, outsider, { accept: true })
        .expect(404);
    });

    it("SECURITY: the link appears only after accepting; capacity holds", async () => {
      const before = await api.get(`sessions/${sessionId}`, first).expect(200);
      expect(before.body.data).toMatchObject({
        myStatus: "INVITED",
        onlineLink: null,
      });
      const after = await api
        .post(`sessions/${sessionId}/respond`, first, { accept: true })
        .expect(201);
      expect(after.body.data.onlineLink).toBe(
        "https://meet.example.org/pricing-crafts",
      );
      await api
        .post(`sessions/${sessionId}/respond`, second, { accept: true })
        .expect(201);
      const full = await api
        .post(`sessions/${sessionId}/respond`, third, { accept: true })
        .expect(409);
      expect(full.body.error.code).toBe("SESSION_FULL");
      // Participants see confirmed people only; the host sees everyone.
      const asFirst = await api.get(`sessions/${sessionId}`, first).expect(200);
      expect(
        asFirst.body.data.participants.map(
          (item: { userId: string }) => item.userId,
        ),
      ).not.toContain(third.id);
      const asHost = await api.get(`sessions/${sessionId}`, host).expect(200);
      expect(
        asHost.body.data.participants.map(
          (item: { userId: string }) => item.userId,
        ),
      ).toContain(third.id);
      expect(asHost.body.data.placesTaken).toBe(2);
    });

    it("SECURITY: a block after joining hides the session", async () => {
      await api.db.userBlock.create({
        data: { blocker_user_id: second.id, blocked_user_id: host.id },
      });
      await api.get(`sessions/${sessionId}`, second).expect(404);
      await api.db.userBlock.deleteMany({
        where: { blocker_user_id: second.id, blocked_user_id: host.id },
      });
    });

    it("reminds confirmed people an hour ahead, once", async () => {
      await api.db.session.update({
        where: { id: sessionId },
        data: { starts_at: new Date(Date.now() + 30 * 60_000) },
      });
      const service = api.app.get(SessionsService);
      await service.sendReminders();
      await service.sendReminders();
      expect(
        await api.db.notification.count({
          where: { user_id: first.id, type: "SESSION_REMINDER" },
        }),
      ).toBe(1);
      expect(
        await api.db.notification.count({
          where: { user_id: third.id, type: "SESSION_REMINDER" },
        }),
      ).toBe(0);
    });

    it("marks attendance and completes; attendees give feedback", async () => {
      await api.post(`sessions/${sessionId}/complete`, host).expect(409); // not started yet
      await api.db.session.update({
        where: { id: sessionId },
        data: { starts_at: new Date(Date.now() - 2 * 3_600_000) },
      });
      await api
        .post(`sessions/${sessionId}/attendance`, host, {
          userId: first.id,
          status: "ATTENDED",
        })
        .expect(201);
      await api
        .post(`sessions/${sessionId}/attendance`, host, {
          userId: second.id,
          status: "NO_SHOW",
        })
        .expect(201);
      await api
        .post(`sessions/${sessionId}/attendance`, first, {
          userId: first.id,
          status: "ATTENDED",
        })
        .expect(404);
      const done = await api
        .post(`sessions/${sessionId}/complete`, host)
        .expect(201);
      expect(done.body.data.status).toBe("COMPLETED");

      const feedback = {
        subjectType: "SESSION",
        subjectId: sessionId,
        rating: 5,
        comment: "Clear and practical.",
      };
      await api.post("reviews", second, feedback).expect(409); // no-show
      await api.post("reviews", outsider, feedback).expect(404);
      await api.post("reviews", first, feedback).expect(201);
      await api.post("reviews", first, feedback).expect(409);
      const hostView = await api
        .get(`reviews/subject?subjectType=SESSION&subjectId=${sessionId}`, host)
        .expect(200);
      expect(hostView.body.data.receivedReviews).toEqual([
        expect.objectContaining({ rating: 5, subjectType: "SESSION" }),
      ]);
    });

    it("records cash per participant for a cash session (host only)", async () => {
      const cash = await workshop(host, {
        title: "Paid tailoring class",
        mode: "IN_PERSON",
        locationId,
        onlineLink: undefined,
        priceModel: "CASH",
        pricePoisha: "20000",
      }).expect(201);
      const id = cash.body.data.id;
      expect(cash.body.data.area).toMatchObject({ id: locationId });
      expect(JSON.stringify(cash.body)).not.toMatch(/"lat"|"lng"|address/);
      await api
        .post(`sessions/${id}/invite`, host, { userIds: [first.id] })
        .expect(201);
      await api.post(`sessions/${id}/publish`, host).expect(201);
      await api
        .post(`sessions/${id}/respond`, first, { accept: true })
        .expect(201);
      await api
        .post(`sessions/${id}/cash`, first, {
          userId: first.id,
          amountPoisha: "20000",
        })
        .expect(404);
      const recorded = await api
        .post(`sessions/${id}/cash`, host, {
          userId: first.id,
          amountPoisha: "20000",
        })
        .expect(201);
      expect(
        recorded.body.data.participants.find(
          (item: { userId: string }) => item.userId === first.id,
        ),
      ).toMatchObject({
        cashAmountPoisha: "20000",
        cashRecordedAt: expect.any(String),
      });
      // Participants don't see others' cash.
      const asFirst = await api.get(`sessions/${id}`, first).expect(200);
      expect(
        asFirst.body.data.participants[0].cashAmountPoisha,
      ).toBeUndefined();
      const cancelled = await api
        .post(`sessions/${id}/cancel`, host, { reason: "Venue unavailable." })
        .expect(201);
      expect(cancelled.body.data).toMatchObject({
        status: "CANCELLED",
        cancelReason: "Venue unavailable.",
      });
      expect(
        await api.db.notification.count({
          where: { user_id: first.id, type: "SESSION_CANCELLED" },
        }),
      ).toBe(1);
    });

    it("keeps women-only sessions to women (by profile), host included", async () => {
      const maleMentor = await makeMentor("Male Mentor", Gender.MALE);
      const refused = await workshop(maleMentor, { womenOnly: true }).expect(
        409,
      );
      expect(refused.body.error.code).toBe("WOMEN_ONLY");
      const id = (
        await workshop(host, {
          womenOnly: true,
          title: "Women in business",
        }).expect(201)
      ).body.data.id;
      const woman = await api.actor([RoleMode.WORKER], {
        profile: { gender: Gender.FEMALE },
      });
      const invited = await api
        .post(`sessions/${id}/invite`, host, {
          userIds: [woman.id, learner.id],
        })
        .expect(201);
      expect(invited.body.data.invited).toEqual([woman.id]);
    });

    it("needs an area for in person and a link to publish online", async () => {
      const noArea = await workshop(host, {
        mode: "IN_PERSON",
        onlineLink: undefined,
      }).expect(409);
      expect(noArea.body.error).toMatchObject({
        code: "SESSION_DETAILS_INVALID",
        field: "locationId",
      });
      const id = (
        await workshop(host, {
          onlineLink: undefined,
          title: "No link yet",
        }).expect(201)
      ).body.data.id;
      const publish = await api
        .post(`sessions/${id}/publish`, host)
        .expect(409);
      expect(publish.body.error.field).toBe("onlineLink");
    });
  });

  it("can be reported by people on it only", async () => {
    const sessionId = (
      await api.get("sessions?role=attending", learner).expect(200)
    ).body.data.items[0].id;
    const report = {
      targetType: "SESSION",
      targetId: sessionId,
      reasonCode: "OTHER",
      description: "Host asked for payment outside the app.",
    };
    await api.post("reports", outsider, report).expect(404);
    await api.post("reports", learner, report).expect(201);
  });

  it("keeps consultations one to one and prices consistent in the database", async () => {
    const base = {
      host_user_id: expert.id,
      title: "x",
      starts_at: new Date(Date.now() + DAY),
      duration_minutes: 30,
      mode: "IN_APP_CHAT" as const,
    };
    await expect(
      api.db.session.create({
        data: { ...base, kind: "CONSULTATION", capacity: 3 },
      }),
    ).rejects.toThrow(/sessions_shape_check/);
    await expect(
      api.db.session.create({
        data: { ...base, kind: "WORKSHOP", capacity: 3, price_model: "CASH" },
      }),
    ).rejects.toThrow(/sessions_price_check/);
  });
});
