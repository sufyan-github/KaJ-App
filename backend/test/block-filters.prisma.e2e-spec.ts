import { randomUUID } from "node:crypto";
import { Gender, MentorStatus, RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R1 / W6: a block keeps two people apart on every list and read.
 * Audit: D-14 conversation list, D-4/M21 consultation seen and accepted by a
 * blocked expert, D-9/API-1 favourites (blocked or undiscoverable workers).
 */
databaseDescribe("blocks filter lists and reads (real HTTP)", () => {
  let api: HttpHarness;

  const block = (blocker: Actor, blocked: Actor) =>
    api.db.userBlock.create({
      data: { blocker_user_id: blocker.id, blocked_user_id: blocked.id },
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("hides a 1:1 conversation from both sides once either blocks", async () => {
    const first = await api.actor([RoleMode.CUSTOMER]);
    const second = await api.actor([RoleMode.WORKER]);
    const conversation = await api.db.conversation.create({
      data: {
        scope_key: `block-filter:${randomUUID()}`,
        participants: {
          create: [{ user_id: first.id }, { user_id: second.id }],
        },
      },
    });
    const ids = async (as: Actor) =>
      (await api.get("conversations", as).expect(200)).body.data.items.map(
        (item: { id: string }) => item.id,
      );
    expect(await ids(first)).toContain(conversation.id);

    await block(second, first);
    expect(await ids(first)).not.toContain(conversation.id);
    expect(await ids(second)).not.toContain(conversation.id);
  });

  it("hides a consultation from a blocked expert, who cannot accept it", async () => {
    const expert = await api.actor([RoleMode.MENTOR, RoleMode.WORKER], {
      profile: { gender: Gender.FEMALE },
    });
    await api.db.profile.update({
      where: { user_id: expert.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    const learner = await api.actor([RoleMode.CUSTOMER]);
    const from = new Date(Date.now() + 2 * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    const slots = await api
      .get(
        `experts/${expert.id}/slots?from=${from.toISOString()}&to=${to.toISOString()}`,
        learner,
      )
      .expect(200);
    const slot = slots.body.data.slots.find(
      (item: { startsAt: string; endsAt: string }) =>
        new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime() >=
        3_600_000,
    );
    const booked = await api
      .post("sessions/consultations", learner, {
        expertUserId: expert.id,
        startsAt: slot.startsAt,
        durationMinutes: 30,
        mode: "IN_APP_CHAT",
      })
      .expect(201);
    const id = booked.body.data.id;
    await api.get(`sessions/${id}`, expert).expect(200);

    await block(learner, expert);
    await api.get(`sessions/${id}`, learner).expect(404);
    await api.get(`sessions/${id}`, expert).expect(404);
    const listed = await api.get("sessions?role=hosting", expert).expect(200);
    expect(
      listed.body.data.items.map((item: { id: string }) => item.id),
    ).not.toContain(id);
    await api
      .post(`sessions/${id}/respond`, expert, { accept: true })
      .expect(404);
    const row = await api.db.session.findUniqueOrThrow({ where: { id } });
    expect(row.status).not.toBe("SCHEDULED");
  });

  it("refuses to favourite across a block and drops favourites after one", async () => {
    const customer = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER]);
    const blocker = await api.actor([RoleMode.WORKER]);
    await block(blocker, customer);
    await api.post(`me/favorites/${blocker.id}`, customer).expect(404);

    await api.post(`me/favorites/${worker.id}`, customer).expect(201);
    await block(worker, customer);
    const list = await api.get("me/favorites", customer).expect(200);
    expect(JSON.stringify(list.body.data)).not.toContain(worker.id);
    expect(JSON.stringify(list.body.data)).not.toContain(blocker.id);
  });

  it("keeps a worker who left the directory out of a stranger's favourites", async () => {
    const stranger = await api.actor([RoleMode.CUSTOMER]);
    const hidden = await api.actor([RoleMode.WORKER], {
      profile: { discoverable: false },
    });
    await api.post(`me/favorites/${hidden.id}`, stranger).expect(404);

    const listed = await api.actor([RoleMode.WORKER]);
    await api.post(`me/favorites/${listed.id}`, stranger).expect(201);
    await api.db.profile.update({
      where: { user_id: listed.id },
      data: { discoverable: false },
    });
    const list = await api.get("me/favorites", stranger).expect(200);
    expect(JSON.stringify(list.body.data)).not.toContain(listed.id);
  });
});
