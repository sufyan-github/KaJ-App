import { randomUUID } from "node:crypto";
import { MessagePermission, RoleMode } from "@prisma/client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * R7 B8 (D-12): "messages only after a hire" also holds in a job
 * conversation opened before the setting changed: a send is refused until
 * the two are hired together. Chats both sides agreed to (an accepted
 * introduction, consultation or collaboration) are not job chats and stay open.
 */
databaseDescribe("ENGAGED_ONLY is checked on send (real HTTP)", () => {
  let api: HttpHarness;

  const text = (as: Actor, conversationId: string, body: string) =>
    api.post(`conversations/${conversationId}/messages`, as, {
      type: "TEXT",
      body,
      clientNonce: randomUUID(),
    });
  const engagedOnly = (as: Actor) =>
    api
      .put("profiles/me/privacy", as, {
        allowMessagesFrom: MessagePermission.ENGAGED_ONLY,
      })
      .expect(200);

  beforeAll(async () => {
    api = await HttpHarness.start();
  });

  afterAll(async () => {
    await api?.close();
  });

  it("refuses an applicant's message in an older job conversation until a hire", async () => {
    const poster = await api.actor([RoleMode.CUSTOMER]);
    const worker = await api.actor([RoleMode.WORKER]);
    const jobId = await api.openJob(poster);
    const applicationId = await api.apply(jobId, worker);
    const conversationId = (
      await api
        .post(`jobs/${jobId}/conversations`, worker, {
          participantUserId: poster.id,
        })
        .expect(201)
    ).body.data.id;
    await text(worker, conversationId, "Before the setting").expect(201);

    await engagedOnly(poster);
    const refused = await text(worker, conversationId, "After").expect(403);
    expect(refused.body.error).toMatchObject({
      code: "MESSAGES_NOT_ALLOWED",
      messageKey: "error.chat.messages_after_hire_only",
    });
    // The poster can still write (the worker allows anyone).
    await text(poster, conversationId, "I'll get back to you").expect(201);

    const assignmentId = (
      await api.post(`applications/${applicationId}/accept`, poster).expect(201)
    ).body.data.id;
    await api.post(`assignments/${assignmentId}/confirm`, worker).expect(201);
    await text(worker, conversationId, "Hired now").expect(201);
  });

  it("leaves a conversation that is not about a job alone", async () => {
    const first = await api.actor([RoleMode.CUSTOMER]);
    const second = await api.actor([RoleMode.MENTOR]);
    const conversation = await api.db.conversation.create({
      data: {
        scope_key: `introduction:${randomUUID()}`,
        participants: {
          create: [{ user_id: first.id }, { user_id: second.id }],
        },
      },
    });
    await engagedOnly(second);
    await text(first, conversation.id, "Thanks for accepting").expect(201);
  });
});
