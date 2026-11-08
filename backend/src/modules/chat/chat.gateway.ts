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
import { Inject } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { Server, Socket } from "socket.io";

import {
  ACCOUNT_MODERATION_READER,
  AccountModerationReader,
} from "../../common/guards/account-moderation.reader";
import { accountActionDenial } from "../../common/guards/account-moderation.guard";
import { CLOCK, Clock } from "../../common/time/clock";
import { AuthTokenService } from "../auth/auth-token.service";
import { ChatEvent, ChatEvents } from "./chat.events";
import { ChatService } from "./chat.service";
import { JoinConversationDto, SocketSendMessageDto } from "./dto/chat.dto";

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
    @Inject(ACCOUNT_MODERATION_READER)
    private readonly accounts: AccountModerationReader,
    @Inject(CLOCK) private readonly clock: Clock,
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
    @MessageBody() raw: unknown,
  ) {
    const userId = await this.userId(client);
    const body = await validated(JoinConversationDto, raw);
    await this.assertAccount(userId, false);
    await this.chat.assertParticipant(userId, body.conversationId);
    await client.join(conversationRoom(body.conversationId));
    return { joined: true, conversationId: body.conversationId };
  }

  @SubscribeMessage("message:send")
  async send(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() raw: unknown,
  ) {
    const userId = await this.userId(client);
    const body = await validated(SocketSendMessageDto, raw);
    await this.assertAccount(userId, true);
    const { conversationId, ...message } = body;
    return this.chat.send(userId, conversationId, message);
  }

  /** Global HTTP guards do not run for gateways, so apply the same account rules here. */
  private async assertAccount(userId: string, mutation: boolean) {
    const denial = accountActionDenial(
      await this.accounts.findAccount(userId),
      this.clock.now(),
      { mutation, safetyWrite: false },
    );
    if (denial) throw new WsException({ code: "FORBIDDEN", message: denial });
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

/**
 * Same rules as the global HTTP ValidationPipe (whitelist, forbid unknown
 * fields, transform), which Nest does not apply to gateway handlers.
 */
async function validated<T extends object>(
  dto: new () => T,
  raw: unknown,
): Promise<T> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new WsException({
      code: "VALIDATION_FAILED",
      message: "Request validation failed.",
    });
  }
  const instance = plainToInstance(dto, raw);
  const errors = await validate(instance, {
    forbidNonWhitelisted: true,
    whitelist: true,
  });
  if (errors.length > 0) {
    throw new WsException({
      code: "VALIDATION_FAILED",
      field: errors[0]!.property,
      message: "Request validation failed.",
    });
  }
  return instance;
}
