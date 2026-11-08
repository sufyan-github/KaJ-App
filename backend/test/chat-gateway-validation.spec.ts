import { WsException } from "@nestjs/websockets";
import { ModerationLevel, UserStatus } from "@prisma/client";
import { Socket } from "socket.io";

import {
  AccountModerationReader,
  AccountModerationState,
} from "../src/common/guards/account-moderation.reader";
import { AuthTokenService } from "../src/modules/auth/auth-token.service";
import { ChatEvents } from "../src/modules/chat/chat.events";
import { ChatGateway } from "../src/modules/chat/chat.gateway";
import { ChatService } from "../src/modules/chat/chat.service";

const CONVERSATION = "01a05e61-850b-7ddc-b456-9291f04c0e20";
const NONCE = "01a05e61-8511-7b01-958b-c30096879e74";
const NOW = new Date("2026-11-08T10:00:00.000Z");

const active: AccountModerationState = {
  deleted_at: null,
  moderation_level: ModerationLevel.NONE,
  restriction_ends_at: null,
  reverification_required: false,
  status: UserStatus.ACTIVE,
};

function setup(account: AccountModerationState | null = active) {
  const send = jest.fn().mockResolvedValue({ id: "message" });
  const assertParticipant = jest.fn().mockResolvedValue(undefined);
  const gateway = new ChatGateway(
    {
      verifyAccessToken: jest.fn().mockResolvedValue({ sub: "user" }),
    } as unknown as AuthTokenService,
    { send, assertParticipant } as unknown as ChatService,
    new ChatEvents(),
    { findAccount: async () => account } as AccountModerationReader,
    { now: () => NOW },
  );
  const socket = {
    data: { userId: "user", accessToken: "token" },
    disconnect: jest.fn(),
    join: jest.fn(),
  } as unknown as Socket;
  return { gateway, send, assertParticipant, socket };
}

const message = {
  conversationId: CONVERSATION,
  type: "TEXT",
  body: "Hello",
  clientNonce: NONCE,
};

async function wsError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(WsException);
  return (error as WsException).getError() as Record<string, unknown>;
}

describe("chat gateway validation and account rules", () => {
  it("sends a valid message without passing conversationId in the body", async () => {
    const { gateway, send, socket } = setup();
    await gateway.send(socket, message);
    expect(send).toHaveBeenCalledWith(
      "user",
      CONVERSATION,
      expect.not.objectContaining({ conversationId: expect.anything() }),
    );
    expect(send.mock.calls[0][2]).toMatchObject({
      body: "Hello",
      clientNonce: NONCE,
    });
  });

  it.each([
    ["a body over 4000 characters", { body: "x".repeat(4_001) }, "body"],
    ["an unknown field", { extra: true }, "extra"],
    ["a malformed nonce", { clientNonce: "not-a-uuid" }, "clientNonce"],
    ["a malformed conversation id", { conversationId: "c" }, "conversationId"],
    ["an unknown message type", { type: "SHOUT" }, "type"],
  ])("rejects %s with VALIDATION_FAILED", async (_label, change, field) => {
    const { gateway, send, socket } = setup();
    const error = await wsError(
      gateway.send(socket, { ...message, ...change }),
    );
    expect(error).toMatchObject({ code: "VALIDATION_FAILED", field });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a non-object payload", async () => {
    const { gateway, socket } = setup();
    const error = await wsError(gateway.send(socket, "hello"));
    expect(error).toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it.each([
    ["restricted", { moderation_level: ModerationLevel.RESTRICT }],
    ["required to re-verify", { reverification_required: true }],
    ["suspended", { status: UserStatus.SUSPENDED }],
    ["banned", { status: UserStatus.BANNED }],
  ])("blocks sending when the account is %s", async (_label, change) => {
    const { gateway, send, socket } = setup({ ...active, ...change });
    const error = await wsError(gateway.send(socket, message));
    expect(error).toMatchObject({ code: "FORBIDDEN" });
    expect(send).not.toHaveBeenCalled();
  });

  it("allows sending once a timed restriction has ended", async () => {
    const { gateway, send, socket } = setup({
      ...active,
      moderation_level: ModerationLevel.RESTRICT,
      restriction_ends_at: new Date(NOW.getTime() - 1),
    });
    await gateway.send(socket, message);
    expect(send).toHaveBeenCalled();
  });

  it("lets a restricted user join (read) but not a suspended one", async () => {
    const restricted = setup({
      ...active,
      moderation_level: ModerationLevel.RESTRICT,
    });
    await expect(
      restricted.gateway.join(restricted.socket, {
        conversationId: CONVERSATION,
      }),
    ).resolves.toMatchObject({ joined: true });

    const suspended = setup({ ...active, status: UserStatus.SUSPENDED });
    const error = await wsError(
      suspended.gateway.join(suspended.socket, {
        conversationId: CONVERSATION,
      }),
    );
    expect(error).toMatchObject({ code: "FORBIDDEN" });
    expect(suspended.assertParticipant).not.toHaveBeenCalled();
  });

  it("validates the join payload", async () => {
    const { gateway, socket } = setup();
    const error = await wsError(gateway.join(socket, { conversationId: "c" }));
    expect(error).toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
