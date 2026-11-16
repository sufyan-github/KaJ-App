import { randomUUID } from "node:crypto";
import { RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

type Page = { items: Array<{ id: string }>; nextCursor: string | null };

/** P1.0: cursor pages on the feed, assignments, notifications and chat. */
databaseDescribe("cursor pagination (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
  });

  afterAll(async () => {
    await api?.close();
  });

  /** Follows nextCursor to the end and returns every id seen. */
  async function walk(
    path: (cursor: string | null) => string,
    as: Actor,
    maxPages = 50,
  ) {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const body: Page = (await api.get(path(cursor), as).expect(200)).body
        .data;
      ids.push(...body.items.map((item) => item.id));
      if (!body.nextCursor) return ids;
      cursor = body.nextCursor;
    }
    throw new Error("Too many pages");
  }

  it("pages notifications without gaps or repeats, and keeps the old default", async () => {
    await api.db.notification.createMany({
      data: Array.from({ length: 7 }, (_, index) => ({
        user_id: worker.id,
        type: "TEST",
        title_key: `Page test ${index}`,
        body_key: "Synthetic notification",
      })),
    });
    const all = (await api.get("notifications", worker).expect(200)).body.data;
    expect(all.items).toHaveLength(7);
    expect(all.nextCursor).toBeNull();
    const walked = await walk(
      (cursor) => `notifications?limit=3${cursor ? `&cursor=${cursor}` : ""}`,
      worker,
    );
    expect(walked).toEqual(all.items.map((item: { id: string }) => item.id));
  });

  it("pages assignments", async () => {
    for (let index = 0; index < 3; index += 1)
      await api.completedAssignment(poster, worker);
    const all = (await api.get("assignments", poster).expect(200)).body.data;
    expect(all.items.length).toBe(3);
    const walked = await walk(
      (cursor) => `assignments?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      poster,
    );
    expect(walked).toEqual(all.items.map((item: { id: string }) => item.id));
  });

  it("pages the job feed", async () => {
    const created = new Set<string>();
    for (let index = 0; index < 5; index += 1)
      created.add(await api.openJob(poster));
    const walked = await walk(
      (cursor) => `jobs?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
      worker,
    );
    expect(new Set(walked).size).toBe(walked.length);
    for (const id of created) expect(walked).toContain(id);
  });

  it("pages chat history backwards, oldest last page", async () => {
    const jobId = await api.openJob(poster);
    await api.apply(jobId, worker);
    const conversationId = (
      await api
        .post(`jobs/${jobId}/conversations`, worker, {
          participantUserId: poster.id,
        })
        .expect(201)
    ).body.data.id;
    const sent: string[] = [];
    for (let index = 0; index < 5; index += 1)
      sent.push(
        (
          await api
            .post(`conversations/${conversationId}/messages`, worker, {
              type: "TEXT",
              body: `Message ${index}`,
              clientNonce: randomUUID(),
            })
            .expect(201)
        ).body.data.id,
      );
    const pages: string[][] = [];
    let before: string | null = null;
    for (;;) {
      const body: Page = (
        await api
          .get(
            `conversations/${conversationId}/messages?limit=2${before ? `&before=${before}` : ""}`,
            poster,
          )
          .expect(200)
      ).body.data;
      pages.push(body.items.map((item) => item.id));
      if (!body.nextCursor) break;
      before = body.nextCursor;
    }
    // Each page is oldest-first; pages go back in time.
    const messages = pages.reverse().flat();
    expect(messages.slice(-5)).toEqual(sent);
  });

  it("rejects a bad cursor or limit", async () => {
    await api.get("notifications?cursor=nope", worker).expect(400);
    await api.get("assignments?limit=0", worker).expect(400);
  });
});
