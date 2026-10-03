import { Socket, Server } from "socket.io";
import { AuthTokenService } from "../src/modules/auth/auth-token.service";
import { ChatEvents } from "../src/modules/chat/chat.events";
import { ChatGateway } from "../src/modules/chat/chat.gateway";
import { ChatService } from "../src/modules/chat/chat.service";

describe("chat respects password-reset session revocation", () => {
  const verify = jest.fn();
  const send = jest.fn();
  const assertParticipant = jest.fn();
  let events: ChatEvents;
  let gateway: ChatGateway;
  const client = () => ({
    data: { userId: "user", accessToken: "old-test-token" },
    handshake: { auth: { token: "old-test-token" }, headers: {} },
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
  });
  beforeEach(() => {
    verify.mockReset().mockResolvedValue({ sub: "user" });
    send.mockReset().mockResolvedValue({ id: "message" });
    assertParticipant.mockReset().mockResolvedValue(undefined);
    events = new ChatEvents();
    gateway = new ChatGateway(
      { verifyAccessToken: verify } as unknown as AuthTokenService,
      { send, assertParticipant } as unknown as ChatService,
      events,
    );
  });

  it("remembers the verified session token for subsequent checks", async () => {
    const socket = client();
    await gateway.handleConnection(socket as unknown as Socket);
    expect(socket.data.accessToken).toBe("old-test-token");
    expect(socket.emit).toHaveBeenCalledWith("chat:ready", { userId: "user" });
  });

  it("rejects messages and room joins from a revoked session", async () => {
    const socket = client();
    verify.mockRejectedValue(new Error("revoked"));
    await expect(
      gateway.send(socket as unknown as Socket, {
        conversationId: "c",
        type: "TEXT",
        body: "blocked",
        clientNonce: "test-nonce",
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      gateway.join(socket as unknown as Socket, { conversationId: "c" }),
    ).rejects.toThrow("Unauthorized");
    expect(send).not.toHaveBeenCalled();
    expect(assertParticipant).not.toHaveBeenCalled();
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it.each([true, false])(
    "checks the session again before delivery (revoked=%s)",
    async (revoked) => {
      const socket = client();
      gateway.server = {
        in: () => ({ fetchSockets: async () => [socket] }),
      } as unknown as Server;
      if (revoked) verify.mockRejectedValue(new Error("revoked"));
      gateway.afterInit();
      events.messages.next({
        conversationId: "c",
        participantUserIds: ["user"],
        message: { senderUserId: "other", text: "private" },
      });
      await new Promise((resolve) => setImmediate(resolve));
      if (revoked) {
        expect(socket.disconnect).toHaveBeenCalledWith(true);
        expect(socket.emit).not.toHaveBeenCalled();
      } else {
        expect(socket.emit).toHaveBeenCalledWith("chat:message", {
          senderUserId: "other",
          text: "private",
          isMine: false,
        });
      }
      events.messages.complete();
    },
  );
});
