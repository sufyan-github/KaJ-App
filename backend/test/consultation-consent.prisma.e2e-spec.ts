import {
  MentorStatus,
  RoleMode,
  SessionKind,
  SessionMode,
  SessionParticipantRole,
  SessionParticipantStatus,
  SessionStatus,
} from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R1 / G11, W4 (D-3/H5): a consultation's chat opens only once the expert
 * has said yes, and one free hour can be booked and accepted only once.
 */
databaseDescribe("consultation consent and slot locking (real HTTP)", () => {
  let api: HttpHarness;

  const makeExpert = async () => {
    const actor = await api.actor([RoleMode.MENTOR, RoleMode.WORKER]);
    await api.db.profile.update({
      where: { user_id: actor.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    return actor;
  };
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
    return slot.startsAt as string;
  };
  const book = (as: Actor, expertUserId: string, startsAt: string) =>
    api.post("sessions/consultations", as, {
      expertUserId,
      startsAt,
      durationMinutes: 30,
      mode: "IN_APP_CHAT",
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("opens the consultation chat only after the expert accepts", async () => {
    const expert = await makeExpert();
    const learner = await api.actor([RoleMode.CUSTOMER]);
    const id = (
      await book(learner, expert.id, await freeHour(learner, expert.id)).expect(
        201,
      )
    ).body.data.id;

    for (const as of [learner, expert]) {
      const early = await api.post(`sessions/${id}/chat`, as).expect(409);
      expect(early.body.error.code).toBe("CONSULTATION_NOT_ACCEPTED");
    }
    expect(
      await api.db.conversation.count({
        where: { scope_key: `session:${id}` },
      }),
    ).toBe(0);

    await api
      .post(`sessions/${id}/respond`, expert, { accept: true })
      .expect(201);
    const room = await api.post(`sessions/${id}/chat`, learner).expect(201);
    expect(room.body.data.conversationId).toEqual(expect.any(String));
  });

  it("keeps the chat closed after the expert declines", async () => {
    const expert = await makeExpert();
    const learner = await api.actor([RoleMode.CUSTOMER]);
    const id = (
      await book(learner, expert.id, await freeHour(learner, expert.id)).expect(
        201,
      )
    ).body.data.id;
    await api
      .post(`sessions/${id}/respond`, expert, { accept: false })
      .expect(201);
    const closed = await api.post(`sessions/${id}/chat`, learner).expect(409);
    expect(closed.body.error.code).toBe("CONSULTATION_NOT_ACCEPTED");
  });

  it("books one free hour once, even when two people ask at the same moment", async () => {
    const expert = await makeExpert();
    const people = await Promise.all(
      [0, 1, 2, 3].map(() => api.actor([RoleMode.CUSTOMER])),
    );
    const startsAt = await freeHour(people[0]!, expert.id);
    const answers = await Promise.all(
      people.map((person) => book(person, expert.id, startsAt)),
    );
    expect(answers.map((answer) => answer.status).sort()).toEqual([
      201, 409, 409, 409,
    ]);
    for (const answer of answers.filter((item) => item.status === 409))
      expect(answer.body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("refuses to accept a second consultation at a time already taken", async () => {
    const expert = await makeExpert();
    const first = await api.actor([RoleMode.CUSTOMER]);
    const second = await api.actor([RoleMode.CUSTOMER]);
    const startsAt = await freeHour(first, expert.id);
    const accepted = (await book(first, expert.id, startsAt).expect(201)).body
      .data.id;
    // A booking for the same time made before the lock existed.
    const clashing = await api.db.session.create({
      data: {
        host_user_id: expert.id,
        expert_user_id: expert.id,
        kind: SessionKind.CONSULTATION,
        title: "Consultation",
        starts_at: new Date(startsAt),
        duration_minutes: 30,
        mode: SessionMode.IN_APP_CHAT,
        capacity: 1,
        status: SessionStatus.DRAFT,
        participants: {
          create: [
            {
              user_id: expert.id,
              role: SessionParticipantRole.EXPERT,
              status: SessionParticipantStatus.INVITED,
              invited_by_user_id: second.id,
            },
            {
              user_id: second.id,
              role: SessionParticipantRole.PARTICIPANT,
              status: SessionParticipantStatus.ACCEPTED,
            },
          ],
        },
      },
    });
    await api
      .post(`sessions/${accepted}/respond`, expert, { accept: true })
      .expect(201);
    const refused = await api
      .post(`sessions/${clashing.id}/respond`, expert, { accept: true })
      .expect(409);
    expect(refused.body.error.code).toBe("SLOT_UNAVAILABLE");
    const row = await api.db.session.findUniqueOrThrow({
      where: { id: clashing.id },
    });
    expect(row.status).toBe(SessionStatus.DRAFT);
  });
});
