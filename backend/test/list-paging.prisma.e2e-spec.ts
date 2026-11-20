import { randomUUID } from "node:crypto";
import { RoleMode, TrustLevel } from "@prisma/client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

type Page = {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

/**
 * R3: lists that grow with use are paged: optional limit + cursor and a
 * nextCursor, with a default page (100) so callers that send nothing see
 * the same rows as before.
 */
databaseDescribe("paging on growing lists (real HTTP)", () => {
  let api: HttpHarness;
  let me: Actor;
  let others: Actor[];

  const pages = async (path: string, key: string) => {
    const first = (await api.get(`${path}?limit=2`, me).expect(200)).body
      .data as Page;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (
      await api
        .get(`${path}?limit=2&cursor=${first.nextCursor}`, me)
        .expect(200)
    ).body.data as Page;
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const all = (await api.get(path, me).expect(200)).body.data as Page;
    expect(all.items).toHaveLength(3);
    const seen = [...first.items, ...second.items].map((item) => item[key]);
    expect(new Set(seen).size).toBe(3);
  };

  beforeAll(async () => {
    api = await HttpHarness.start();
    me = await api.actor([RoleMode.CUSTOMER, RoleMode.WORKER], {
      trust: TrustLevel.IDENTITY,
    });
    others = await Promise.all(
      [0, 1, 2].map(() => api.actor([RoleMode.WORKER])),
    );
  });

  afterAll(async () => {
    await api?.close();
  });

  it("pages favourites", async () => {
    for (const other of others)
      await api.post(`me/favorites/${other.id}`, me).expect(201);
    await pages("me/favorites", "userId");
  });

  it("pages conversations", async () => {
    for (const other of others)
      await api.db.conversation.create({
        data: {
          scope_key: `paging:${randomUUID()}`,
          participants: { create: [{ user_id: me.id }, { user_id: other.id }] },
        },
      });
    await pages("conversations", "id");
  });

  it("pages a job's applications", async () => {
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    const skill = await api.db.skill.findFirstOrThrow({
      where: { category_id: category.id, is_active: true },
    });
    const location = await api.db.location.findFirstOrThrow({
      where: { type: "AREA", is_active: true },
    });
    const slot = futureSlot(21);
    const jobId = (
      await api
        .post("jobs", me, {
          title: "Paging job",
          description: "A job used only by the paging test.",
          categoryId: category.id,
          skillIds: [skill.id],
          locationId: location.id,
          jobType: "ONE_TIME",
          paymentModel: "FIXED",
          budgetMinPoisha: "10000",
          budgetMaxPoisha: "20000",
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })
        .expect(201)
    ).body.data.id;
    for (const other of others)
      await api.db.application.create({
        data: { job_id: jobId, worker_user_id: other.id },
      });
    await pages(`jobs/${jobId}/applications`, "id");
  });

  it("pages the block list (last: blocks hide the other lists)", async () => {
    for (const other of others)
      await api.post(`users/${other.id}/block`, me).expect(201);
    await pages("me/blocks", "userId");
  });
});
