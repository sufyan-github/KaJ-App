import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

import { AuthTokenService } from "../auth/auth-token.service";
import { ChatEvent, ChatEvents } from "./chat.events";
import { ChatService } from "./chat.service";
import { SendMessageDto } from "./dto/chat.dto";

interface AuthenticatedSocket extends Socket {
  data: { userId?: string; accessToken?: string };
}

@WebSocketGateway({
  namespace: "/chat",
  cors: { origin: false },
  transports: ["websocket", "polling"],
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly tokens: AuthTokenService,
    private readonly chat: ChatService,
    private readonly events: ChatEvents,
  ) {}

  afterInit() {
    this.events.messages.subscribe((event) => {
      void this.deliverMessage(event);
    });
  }

  private async deliverMessage(event: ChatEvent) {
    try {
      for (const userId of event.participantUserIds) {
        const clients = await this.server.in(userRoom(userId)).fetchSockets();
        for (const client of clients) {
          try {
            await this.tokens.verifyAccessToken(client.data.accessToken ?? "");
            client.emit("chat:message", {
              ...event.message,
              isMine: event.message.senderUserId === userId,
            });
          } catch {
            client.disconnect(true);
          }
        }
      }
    } catch {
      /* Do not expose tokens or message contents in diagnostics. */
    }
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const raw =
        client.handshake.auth.token ?? client.handshake.headers.authorization;
      const token =
        typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "") : "";
      const claims = await this.tokens.verifyAccessToken(token);
      client.data.userId = claims.sub;
      client.data.accessToken = token;
      await client.join(userRoom(claims.sub));
      client.emit("chat:ready", { userId: claims.sub });
    } catch {
      client.emit("chat:error", { code: "UNAUTHORIZED" });
      client.disconnect(true);
    }
  }

  @SubscribeMessage("conversation:join")
  async join(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { conversationId?: string },
  ) {
    const userId = await this.userId(client);
    if (!body.conversationId) throw new WsException("Missing conversation id.");
    await this.chat.assertParticipant(userId, body.conversationId);
    await client.join(conversationRoom(body.conversationId));
    return { joined: true, conversationId: body.conversationId };
  }

  @SubscribeMessage("message:send")
  async send(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    body: SendMessageDto & { conversationId?: string },
  ) {
    const userId = await this.userId(client);
    if (!body.conversationId) throw new WsException("Missing conversation id.");
    return this.chat.send(userId, body.conversationId, body);
  }

  private async userId(client: AuthenticatedSocket) {
    if (!client.data.userId) throw new WsException("Unauthorized.");
    try {
      await this.tokens.verifyAccessToken(client.data.accessToken ?? "");
    } catch {
      client.disconnect(true);
      throw new WsException("Unauthorized.");
    }
    return client.data.userId;
  }
}

function userRoom(userId: string) {
  return `user:${userId}`;
}

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}
