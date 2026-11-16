import { RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * N6: the chat list showed the poster's full name before a hire while the
 * job page masked it. Both now follow one rule.
 */
databaseDescribe("names in the chat list and job page (real HTTP)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let jobId: string;
  let applicationId: string;
  let conversationId: string;

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER], {
      displayName: "সাবিনা রহমান",
    });
    worker = await api.actor([RoleMode.WORKER], {
      displayName: "আরিফ হোসেন",
    });
    jobId = await api.openJob(poster);
    applicationId = await api.apply(jobId, worker);
    conversationId = (
      await api
        .post(`jobs/${jobId}/conversations`, worker, {
          participantUserId: poster.id,
        })
        .expect(201)
    ).body.data.id;
  });

  afterAll(async () => {
    await api?.close();
  });

  const chatName = async (as: Actor) =>
    (await api.get("conversations", as).expect(200)).body.data.items.find(
      (item: { id: string }) => item.id === conversationId,
    ).otherName;
  const jobPosterName = async (as: Actor) =>
    (await api.get(`jobs/${jobId}`, as).expect(200)).body.data.poster
      .displayName;

  it("masks both names before a hire, the same way on both screens", async () => {
    expect(await chatName(worker)).toBe("সাবিনা র.");
    expect(await jobPosterName(worker)).toBe("সাবিনা র.");
    expect(await chatName(poster)).toBe("আরিফ হ.");
    // The poster always sees their own name.
    expect(await jobPosterName(poster)).toBe("সাবিনা রহমান");
  });

  it("shows the full name when the person chose to", async () => {
    await api.put("profiles/me/privacy", poster, { showFullName: true });
    expect(await chatName(worker)).toBe("সাবিনা রহমান");
    expect(await jobPosterName(worker)).toBe("সাবিনা রহমান");
    await api.put("profiles/me/privacy", poster, { showFullName: false });
  });

  it("stays masked while an offer waits, and shows full names once the hire is confirmed", async () => {
    const accepted = await api
      .post(`applications/${applicationId}/accept`, poster)
      .expect(201);
    // Offered but not yet confirmed by the worker.
    expect(await chatName(worker)).toBe("সাবিনা র.");
    await api
      .post(`assignments/${accepted.body.data.id}/confirm`, worker)
      .expect(201);
    expect(await chatName(worker)).toBe("সাবিনা রহমান");
    expect(await chatName(poster)).toBe("আরিফ হোসেন");
    expect(await jobPosterName(worker)).toBe("সাবিনা রহমান");
  });
});
