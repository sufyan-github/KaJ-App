import { randomUUID } from "node:crypto";
import { RoleMode } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R7 B4: an Idempotency-Key on a booking or money POST replays the first
 * result for the same body and refuses a different body or route
 * (409 IDEMPOTENCY_KEY_REUSED). Without the header the route works as before.
 */
databaseDescribe("Idempotency-Key on booking writes (real HTTP)", () => {
  let api: HttpHarness;
  let body: Record<string, unknown>;

  const createJob = (as: Actor, key: string | null, extra = {}) => {
    const call = api.post("jobs", as, { ...body, ...extra });
    return key ? call.set("Idempotency-Key", key) : call;
  };
  const jobCount = (as: Actor) =>
    api.db.job.count({ where: { poster_user_id: as.id } });

  beforeAll(async () => {
    api = await HttpHarness.start();
    const slot = futureSlot(5);
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    const location = await api.db.location.findFirstOrThrow({
      where: { is_active: true },
    });
    body = {
      title: "Idempotent test job",
      description: "A job created twice with one Idempotency-Key.",
      categoryId: category.id,
      skillIds: [],
      locationId: location.id,
      jobType: "ONE_TIME",
      paymentModel: "FIXED",
      budgetMinPoisha: "10000",
      budgetMaxPoisha: "20000",
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
    };
  });

  afterAll(async () => {
    await api?.close();
  });

  it("replays the first job for the same key and body", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const key = randomUUID();
    const first = await createJob(poster, key).expect(201);
    const again = await createJob(poster, key).expect(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.body.data).toEqual(first.body.data);
    expect(await jobCount(poster)).toBe(1);
  });

  it("refuses the same key with a different body or on another route", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER, RoleMode.WORKER]);
    const key = randomUUID();
    await createJob(poster, key).expect(201);
    const changed = await createJob(poster, key, {
      title: "Another job entirely",
    }).expect(409);
    expect(changed.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(changed.body.error.messageKey).toBe(
      "error.common.idempotency_key_reused",
    );
    expect(await jobCount(poster)).toBe(1);

    const other = await api.actor([RoleMode.CUSTOMER]);
    const jobId = await api.openJob(other);
    const elsewhere = await api
      .post(`jobs/${jobId}/applications`, poster, {
        message: "I can do this job on time.",
        proposedPricePoisha: "15000",
      })
      .set("Idempotency-Key", key)
      .expect(409);
    expect(elsewhere.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("keeps keys per person and leaves calls without a key alone", async () => {
    const first = await api.actor([RoleMode.CUSTOMER]);
    const second = await api.actor([RoleMode.CUSTOMER]);
    const key = randomUUID();
    const a = await createJob(first, key).expect(201);
    const b = await createJob(second, key).expect(201);
    expect(b.body.data.id).not.toBe(a.body.data.id);

    await createJob(first, null).expect(201);
    await createJob(first, null).expect(201);
    expect(await jobCount(first)).toBe(3);
  });

  it("does not keep a failed call, so a corrected retry with the key works", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const key = randomUUID();
    await createJob(poster, key, { categoryId: randomUUID() }).expect(
      (response) => expect(response.status).toBeGreaterThanOrEqual(400),
    );
    // A different body after a failure is a fresh attempt, not a reuse.
    await createJob(poster, key).expect(201);
    expect(await jobCount(poster)).toBe(1);
  });

  it("replays an application instead of applying twice", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER]);
    const jobId = await api.openJob(poster);
    const job = await api.db.job.findUniqueOrThrow({ where: { id: jobId } });
    const apply = () =>
      api
        .post(`jobs/${jobId}/applications`, worker, {
          message: "I can do this job on time.",
          proposedPricePoisha: "15000",
          proposedStartsAt: job.starts_at!.toISOString(),
          proposedEndsAt: job.ends_at!.toISOString(),
        })
        .set("Idempotency-Key", "apply-once");
    const first = await apply().expect(201);
    const again = await apply().expect(201);
    expect(again.body.data.id).toBe(first.body.data.id);
  });
});
