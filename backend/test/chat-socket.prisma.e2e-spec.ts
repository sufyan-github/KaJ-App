import { randomUUID } from "node:crypto";
import { ModerationLevel, RoleMode } from "@prisma/client";
import { io, Socket } from "socket.io-client";

import { Actor, futureSlot, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

type SocketError = Record<string, unknown>;

/**
 * The chat socket applies the same account, block and validation rules as
 * REST, and reports failures with the same error codes.
 */
databaseDescribe("chat socket safety (real socket.io)", () => {
  let api: HttpHarness;
  let poster: Actor;
  let worker: Actor;
  let conversationId: string;
  const sockets: Socket[] = [];

  async function connect(as: Actor): Promise<Socket> {
    const socket = io(`${api.url}/chat`, {
      auth: { token: as.token },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("chat:ready", () => resolve());
      socket.once("chat:error", reject);
      socket.once("connect_error", reject);
    });
    return socket;
  }

  /** Emits and resolves with either the ack or the `exception` event. */
  function emit(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<{ ack?: Record<string, unknown>; error?: SocketError }> {
    return new Promise((resolve) => {
      const onError = (error: SocketError) => resolve({ error });
      socket.once("exception", onError);
      socket.emit(event, payload, (ack: Record<string, unknown>) => {
        socket.off("exception", onError);
        resolve({ ack });
      });
    });
  }

  const text = (body: string) => ({
    conversationId,
    type: "TEXT",
    body,
    clientNonce: randomUUID(),
  });

  const messageCount = () =>
    api.db.message.count({ where: { conversation_id: conversationId } });

  beforeAll(async () => {
    api = await HttpHarness.start();
    poster = await api.actor([RoleMode.CUSTOMER]);
    worker = await api.actor([RoleMode.WORKER]);
    const category = await api.db.category.findFirstOrThrow({
      where: { is_active: true, parent_id: null },
    });
    const location = await api.db.location.findFirstOrThrow({
      where: { is_active: true },
    });
    const slot = futureSlot(6);
    const job = await api
      .post("jobs", poster, {
        title: "Chat socket test job",
        description: "A synthetic job used only by the chat socket test.",
        categoryId: category.id,
        skillIds: [],
        locationId: location.id,
        jobType: "ONE_TIME",
        paymentModel: "FIXED",
        budgetMinPoisha: "10000",
        budgetMaxPoisha: "20000",
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    const jobId = job.body.data.id as string;
    await api.post(`jobs/${jobId}/publish`, poster).expect(201);
    await api
      .post(`jobs/${jobId}/applications`, worker, {
        proposedStartsAt: slot.startsAt.toISOString(),
        proposedEndsAt: slot.endsAt.toISOString(),
      })
      .expect(201);
    conversationId = (
      await api
        .post(`jobs/${jobId}/conversations`, worker, {
          participantUserId: poster.id,
        })
        .expect(201)
    ).body.data.id;
  });

  afterEach(async () => {
    await api.db.user.updateMany({
      where: { id: { in: [poster.id, worker.id] } },
      data: { moderation_level: ModerationLevel.NONE },
    });
    await api.db.userBlock.deleteMany({
      where: { blocker_user_id: { in: [poster.id, worker.id] } },
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await api?.close();
  });

  it("delivers a valid message to the other participant", async () => {
    const [sender, receiver] = await Promise.all([
      connect(worker),
      connect(poster),
    ]);
    const delivered = new Promise<Record<string, unknown>>((resolve) =>
      receiver.once("chat:message", resolve),
    );
    const { ack, error } = await emit(sender, "message:send", text("Hello"));
    expect(error).toBeUndefined();
    expect(ack).toMatchObject({ body: "Hello" });
    await expect(delivered).resolves.toMatchObject({
      body: "Hello",
      isMine: false,
    });
  });

  it("refuses a restricted user, as REST does", async () => {
    await api.db.user.update({
      where: { id: worker.id },
      data: { moderation_level: ModerationLevel.RESTRICT },
    });
    const socket = await connect(worker);
    const before = await messageCount();

    const { error } = await emit(socket, "message:send", text("Hi"));
    expect(error).toMatchObject({
      code: "ACCOUNT_RESTRICTED",
      messageKey: "error.account.restricted",
    });
    expect(await messageCount()).toBe(before);

    // The REST route gives the same answer.
    const rest = await api
      .post(`conversations/${conversationId}/messages`, worker, {
        type: "TEXT",
        body: "Hi",
        clientNonce: randomUUID(),
      })
      .expect(403);
    expect(rest.body.error.code).toBe("ACCOUNT_RESTRICTED");
  });

  it("refuses a message between blocked users with USER_BLOCKED", async () => {
    await api.post(`users/${worker.id}/block`, poster).expect(201);
    const socket = await connect(worker);
    const before = await messageCount();
    const { error } = await emit(socket, "message:send", text("Hi"));
    expect(error).toMatchObject({
      code: "USER_BLOCKED",
      messageKey: "error.safety.blocked",
      httpStatus: 409,
    });
    expect(await messageCount()).toBe(before);
  });

  it("validates the payload like REST", async () => {
    const socket = await connect(worker);
    const { error } = await emit(socket, "message:send", {
      ...text("Hi"),
      clientNonce: "not-a-uuid",
      extra: true,
    });
    expect(error).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("reports a service error with its code, not 'Internal server error'", async () => {
    const stranger = await api.actor([RoleMode.WORKER]);
    const socket = await connect(stranger);
    const { error } = await emit(socket, "message:send", text("Hi"));
    expect(error).toMatchObject({
      code: "NOT_FOUND",
      messageKey: "error.common.not_found",
      httpStatus: 404,
    });
  });

  it("rejects a connection without a valid token", async () => {
    const socket = io(`${api.url}/chat`, {
      auth: { token: "not-a-token" },
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    await expect(
      new Promise((resolve) => socket.once("chat:error", resolve)),
    ).resolves.toEqual({ code: "UNAUTHORIZED" });
  });
});
