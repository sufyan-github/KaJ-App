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
import { ChatEvents } from "./chat.events";
import { ChatService } from "./chat.service";
import { SendMessageDto } from "./dto/chat.dto";

interface AuthenticatedSocket extends Socket {
  data: { userId?: string };
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
      for (const userId of event.participantUserIds) {
        this.server.to(userRoom(userId)).emit("chat:message", {
          ...event.message,
          isMine: event.message.senderUserId === userId,
        });
      }
    });
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const raw =
        client.handshake.auth.token ?? client.handshake.headers.authorization;
      const token =
        typeof raw === "string" ? raw.replace(/^Bearer\s+/i, "") : "";
      const claims = await this.tokens.verifyAccessToken(token);
      client.data.userId = claims.sub;
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
    const userId = this.userId(client);
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
    const userId = this.userId(client);
    if (!body.conversationId) throw new WsException("Missing conversation id.");
    return this.chat.send(userId, body.conversationId, body);
  }

  private userId(client: AuthenticatedSocket) {
    if (!client.data.userId) throw new WsException("Unauthorized.");
    return client.data.userId;
  }
}

function userRoom(userId: string) {
  return `user:${userId}`;
}

function conversationRoom(conversationId: string) {
  return `conversation:${conversationId}`;
}
