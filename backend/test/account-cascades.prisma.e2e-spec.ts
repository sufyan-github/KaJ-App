import { randomUUID } from "node:crypto";
import {
  AdminRole,
  MentorStatus,
  ModerationLevel,
  RoleMode,
  TrustLevel,
} from "@prisma/client";

import { ModerationService } from "../src/modules/moderation/moderation.service";
import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

const DAY = 86_400_000;

/**
 * R2 / DB-3: when someone is suspended, banned or deletes their account,
 * their job and learning listings leave the feeds and the sessions they host
 * are cancelled (participants are told).
 */
databaseDescribe("account cascades (real HTTP)", () => {
  let api: HttpHarness;
  let categoryId: string;
  let skillId: string;
  let locationId: string;
  let viewer: Actor;

  const ids = (body: { data: { items: Array<{ id: string }> } }) =>
    body.data.items.map((item) => item.id);
  const hostWithSession = async () => {
    const host = await api.actor([RoleMode.MENTOR, RoleMode.WORKER]);
    await api.db.profile.update({
      where: { user_id: host.id },
      data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
    });
    const sessionId = (
      await api
        .post("sessions", host, {
          kind: "WORKSHOP",
          title: "Cascade workshop",
          description: "For the DB-3 test.",
          startsAt: new Date(Date.now() + 4 * DAY).toISOString(),
          durationMinutes: 60,
          mode: "ONLINE",
          onlineLink: "https://meet.example.org/cascade-db3",
          capacity: 5,
        })
        .expect(201)
    ).body.data.id as string;
    await api
      .post(`sessions/${sessionId}/invite`, host, { userIds: [viewer.id] })
      .expect(201);
    await api.post(`sessions/${sessionId}/publish`, host).expect(201);
    return { host, sessionId };
  };
  const admin = async () => ({
    userId: (await api.actor([RoleMode.CUSTOMER])).id,
    email: "admin@kaj.test",
    role: AdminRole.ADMIN,
    sessionId: randomUUID(),
  });

  beforeAll(async () => {
    api = await HttpHarness.start();
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    skillId = (
      await api.db.skill.findFirstOrThrow({
        where: { category_id: categoryId, is_active: true },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
    viewer = await api.actor([RoleMode.WORKER, RoleMode.CUSTOMER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  it("hides a suspended poster's jobs and cancels the sessions they host", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER, RoleMode.MENTOR], {
      trust: TrustLevel.IDENTITY,
    });
    const slot = futureSlot(15);
    const jobId = (
      await api
        .post("jobs", poster, {
          title: `Cascade job ${randomUUID().slice(0, 6)}`,
          description: "A job used only by the DB-3 test.",
          categoryId,
          skillIds: [skillId],
          locationId,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })
        .expect(201)
    ).body.data.id;
    await api.post(`jobs/${jobId}/publish`, poster).expect(201);
    const feed = async () =>
      ids(
        (await api.get(`jobs?limit=100&locationId=${locationId}`, viewer)).body,
      );
    expect(await feed()).toContain(jobId);

    const { host, sessionId } = await hostWithSession();
    const moderation = api.app.get(ModerationService);
    const actor = await admin();
    const context = { ip: "127.0.0.1", ua: "db3-test" };
    for (const person of [poster, host])
      for (const action of [
        ModerationLevel.WARN,
        ModerationLevel.RESTRICT,
        ModerationLevel.SUSPEND,
      ])
        await moderation.moderateUser(
          person.id,
          { action, reason: "Testing what suspension does." } as never,
          actor,
          context,
        );

    expect(await feed()).not.toContain(jobId);
    const session = await api.db.session.findUniqueOrThrow({
      where: { id: sessionId },
    });
    expect(session.status).toBe("CANCELLED");
    expect(
      await api.db.notification.count({
        where: { user_id: viewer.id, type: "SESSION_CANCELLED" },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it("cancels the sessions of someone who deletes their account", async () => {
    const { host, sessionId } = await hostWithSession();
    await api.delete("me", host).expect(200);
    expect(
      (await api.db.session.findUniqueOrThrow({ where: { id: sessionId } }))
        .status,
    ).toBe("CANCELLED");
  });
});
