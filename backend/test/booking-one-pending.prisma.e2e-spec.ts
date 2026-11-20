import { RoleMode, TrustLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R2 / W11: a booking request holds the worker's slot: a second request
 * for the same worker and the same time, sent after or alongside the first,
 * is refused instead of creating a duplicate job and assignment.
 */
databaseDescribe("one pending booking per worker and slot (real HTTP)", () => {
  let api: HttpHarness;
  let categoryId: string;
  let locationId: string;

  const worker = async () => {
    const actor = await api.actor([RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
    });
    await api.db.availabilityRule.deleteMany({ where: { user_id: actor.id } });
    await api.db.availabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, day) => ({
        user_id: actor.id,
        day_of_week: day,
        start_time: new Date("1970-01-01T00:00:00Z"),
        end_time: new Date("1970-01-01T23:59:00Z"),
      })),
    });
    return actor;
  };
  const book = (as: Actor, workerId: string, days: number) => {
    const slot = futureSlot(days);
    return api.post(`workers/${workerId}/booking-requests`, as, {
      title: "Fix the kitchen tap",
      description: "A booking request used only by the W11 test.",
      categoryId,
      locationId,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      offeredPricePoisha: "15000",
    });
  };
  const pending = (workerId: string) =>
    api.db.assignment.count({
      where: { worker_user_id: workerId, status: "PENDING_CONFIRMATION" },
    });

  beforeAll(async () => {
    api = await HttpHarness.start();
    categoryId = (
      await api.db.category.findFirstOrThrow({
        where: { is_active: true, parent_id: null },
      })
    ).id;
    locationId = (
      await api.db.location.findFirstOrThrow({
        where: { type: "AREA", is_active: true },
      })
    ).id;
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses a second identical request", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    const target = await worker();
    await book(poster, target.id, 6).expect(201);
    const again = await book(poster, target.id, 6).expect(409);
    expect(again.body.error.code).toBe("BOOKING_ALREADY_PENDING");
    expect(await pending(target.id)).toBe(1);
    // Another time is still fine.
    await book(poster, target.id, 7).expect(201);
  });

  it("creates one booking when two arrive at once", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER], {
      trust: TrustLevel.IDENTITY,
    });
    const target = await worker();
    const answers = await Promise.all([
      book(poster, target.id, 8),
      book(poster, target.id, 8),
    ]);
    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect(await pending(target.id)).toBe(1);
  });
});
