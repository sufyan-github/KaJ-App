import { randomUUID } from "node:crypto";
import {
  MentorStatus,
  ModerationLevel,
  RoleMode,
  TrustLevel,
} from "@prisma/client";
import { io, Socket } from "socket.io-client";

import { Actor, HttpHarness } from "./support/http-harness";

const databaseDescribe =
  process.env.AUTH_DATABASE_E2E === "1" ? describe : describe.skip;

type Message = { body: string; senderUserId: string; safetyWarning: boolean };

/**
 * P3.3: group conversations (idea rooms, session chats) with the same
 * moderation, block and safety rules as 1:1 chat, over REST and the
 * socket, and across two API instances through the Redis adapter.
 */
databaseDescribe("group conversations (real HTTP + socket.io)", () => {
  let api: HttpHarness;
  let owner: Actor;
  let member: Actor;
  let blocker: Actor;
  let outsider: Actor;
  let ideaId: string;
  let roomId: string;
  const sockets: Socket[] = [];

  async function connect(on: HttpHarness, as: Actor) {
    const socket = io(`${on.url}/chat`, {
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
  /** Messages a socket receives within `ms`. */
  function collect(socket: Socket, ms = 800) {
    const received: Message[] = [];
    socket.on("chat:message", (message: Message) => received.push(message));
    return () =>
      new Promise<Message[]>((resolve) =>
        setTimeout(() => resolve(received), ms),
      );
  }
  const send = (as: Actor, body: string, on = api) =>
    on.post(`conversations/${roomId}/messages`, as, {
      type: "TEXT",
      body,
      clientNonce: randomUUID(),
    });
  const bodies = async (as: Actor) =>
    (
      await api.get(`conversations/${roomId}/messages`, as).expect(200)
    ).body.data.items.map((item: Message) => item.body);

  beforeAll(async () => {
    api = await HttpHarness.start();
    owner = await api.actor([RoleMode.CUSTOMER], {
      displayName: "Kulsum Begum",
      trust: TrustLevel.IDENTITY,
    });
    member = await api.actor([RoleMode.WORKER], { displayName: "Ratan Pal" });
    blocker = await api.actor([RoleMode.WORKER], { displayName: "Mina Das" });
    outsider = await api.actor([RoleMode.WORKER]);
    const sector = await api.db.businessCategory.findUniqueOrThrow({
      where: { slug: "food" },
    });
    ideaId = (
      await api
        .post("ideas", owner, {
          title: "Pickle cooperative",
          summary: "Village women make and sell mango pickle together.",
          problem: "Each household sells tiny amounts at low prices.",
          solution: "Pool production, brand it and sell to city shops.",
          categoryId: sector.id,
        })
        .expect(201)
    ).body.data.id;
    for (const actor of [member, blocker])
      await api.db.ideaMember.create({
        data: {
          idea_id: ideaId,
          user_id: actor.id,
          agreed_in_principle_at: new Date(),
        },
      });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await api?.close();
  });

  describe("idea room", () => {
    it("opens a group of the owner and the team; others get 404", async () => {
      const room = await api.post(`ideas/${ideaId}/room`, member).expect(201);
      roomId = room.body.data.conversationId;
      const again = await api.post(`ideas/${ideaId}/room`, owner).expect(201);
      expect(again.body.data.conversationId).toBe(roomId);
      const participants = await api.db.conversationParticipant.findMany({
        where: { conversation_id: roomId },
      });
      expect(participants.map((row) => row.user_id).sort()).toEqual(
        [owner.id, member.id, blocker.id].sort(),
      );
      await api.post(`ideas/${ideaId}/room`, outsider).expect(404);
      const list = await api.get("conversations", member).expect(200);
      expect(list.body.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: roomId,
            kind: "GROUP",
            title: "Pickle cooperative",
            participantCount: 3,
            subject: { type: "IDEA_ROOM", id: ideaId },
            otherUserId: null,
          }),
        ]),
      );
    });

    it("SECURITY: a non-member gets 404 on the group chat (REST and socket)", async () => {
      await api.get(`conversations/${roomId}/messages`, outsider).expect(404);
      await send(outsider, "Let me in").expect(404);
      const socket = await connect(api, outsider);
      const error = await new Promise<Record<string, unknown>>((resolve) => {
        socket.once("exception", resolve);
        socket.emit("conversation:join", { conversationId: roomId }, () =>
          resolve({ joined: true }),
        );
      });
      expect(error.joined).toBeUndefined();
    });

    it("delivers to every member over the socket, with the safety warning", async () => {
      const toMember = collect(await connect(api, member));
      const toOwner = collect(await connect(api, owner));
      const sent = await send(
        owner,
        "Send the deposit on bkash 01712345678 please",
      ).expect(201);
      expect(sent.body.data.safetyWarning).toBe(true);
      expect((await toMember()).map((item) => item.body)).toContain(
        "Send the deposit on bkash 01712345678 please",
      );
      expect((await toOwner()).length).toBeGreaterThan(0);
      expect(
        await api.db.notification.count({
          where: { user_id: member.id, type: "GROUP_CHAT_MESSAGE" },
        }),
      ).toBe(1);
    });

    it("SECURITY: blocked people don't see each other in the group; others do", async () => {
      await api.post(`users/${member.id}/block`, blocker).expect(201);
      const toBlocker = collect(await connect(api, blocker));
      const toOwner = collect(await connect(api, owner));
      await send(member, "Pickle jars arrive Tuesday").expect(201);
      expect((await toBlocker()).map((item) => item.body)).not.toContain(
        "Pickle jars arrive Tuesday",
      );
      expect((await toOwner()).map((item) => item.body)).toContain(
        "Pickle jars arrive Tuesday",
      );
      expect(await bodies(blocker)).not.toContain("Pickle jars arrive Tuesday");
      expect(await bodies(owner)).toContain("Pickle jars arrive Tuesday");
      // The blocker's own messages are hidden from the member too.
      await send(blocker, "Labels are printed").expect(201);
      expect(await bodies(member)).not.toContain("Labels are printed");
      expect(await bodies(owner)).toContain("Labels are printed");
      await api.delete(`users/${member.id}/block`, blocker).expect(200);
    });

    it("applies account moderation as in 1:1 chat", async () => {
      await api.db.user.update({
        where: { id: member.id },
        data: { moderation_level: ModerationLevel.RESTRICT },
      });
      const refused = await send(member, "Still here?").expect(403);
      expect(refused.body.error.code).toBe("ACCOUNT_RESTRICTED");
      await api.db.user.update({
        where: { id: member.id },
        data: { moderation_level: ModerationLevel.NONE },
      });
    });

    it("follows the team: a removed member leaves the room", async () => {
      await api
        .delete(`ideas/${ideaId}/members/${blocker.id}`, owner)
        .expect(200);
      await api.get(`conversations/${roomId}/messages`, blocker).expect(404);
      await api.post(`ideas/${ideaId}/room`, blocker).expect(404);
    });
  });

  describe("session chat", () => {
    it("is for the host and confirmed participants only", async () => {
      const host = await api.actor([RoleMode.MENTOR, RoleMode.WORKER]);
      await api.db.profile.update({
        where: { user_id: host.id },
        data: { mentor_status: MentorStatus.APPROVED, mentor_accepting: true },
      });
      const guest = await api.actor([RoleMode.WORKER]);
      const id = (
        await api
          .post("sessions", host, {
            kind: "GROUP_DISCUSSION",
            title: "Pickle pricing circle",
            startsAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
            durationMinutes: 60,
            mode: "IN_APP_CHAT",
            capacity: 5,
          })
          .expect(201)
      ).body.data.id;
      await api
        .post(`sessions/${id}/invite`, host, { userIds: [guest.id] })
        .expect(201);
      await api.post(`sessions/${id}/publish`, host).expect(201);
      const chat = await api.post(`sessions/${id}/chat`, host).expect(201);
      const conversationId = chat.body.data.conversationId;
      // Invited but not accepted: not in the chat yet.
      await api.post(`sessions/${id}/chat`, guest).expect(404);
      await api
        .get(`conversations/${conversationId}/messages`, guest)
        .expect(404);
      await api
        .post(`sessions/${id}/respond`, guest, { accept: true })
        .expect(201);
      await api
        .get(`conversations/${conversationId}/messages`, guest)
        .expect(200);
      await api.post(`sessions/${id}/leave`, guest).expect(201);
      await api
        .get(`conversations/${conversationId}/messages`, guest)
        .expect(404);
      await api.post(`sessions/${id}/chat`, outsider).expect(404);
    });
  });

  describe("across two API instances (Redis adapter)", () => {
    let first: HttpHarness;
    let second: HttpHarness;

    beforeAll(async () => {
      first = await HttpHarness.start(undefined, { redisSocketAdapter: true });
      second = await HttpHarness.start(undefined, { redisSocketAdapter: true });
    });

    afterAll(async () => {
      for (const socket of sockets) socket.disconnect();
      await first?.close();
      await second?.close();
    });

    it("delivers a message sent on one instance to a socket on the other", async () => {
      const toOwnerOnSecond = collect(await connect(second, owner), 1500);
      await send(member, "Hello from instance one", first).expect(201);
      expect((await toOwnerOnSecond()).map((item) => item.body)).toContain(
        "Hello from instance one",
      );
    });
  });

  it("keeps a group tied to its subject in the database", async () => {
    await expect(
      api.db.conversation.create({
        data: { scope_key: `bad-${randomUUID()}`, kind: "GROUP" },
      }),
    ).rejects.toThrow(/conversations_group_subject_check/);
  });
});
