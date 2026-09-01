import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MessageType, Prisma } from "@prisma/client";

import { CLOCK, Clock } from "../../common/time/clock";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { STORAGE_PORT, StoragePort } from "../../infra/storage/storage.port";
import { NotificationsService } from "../notifications/notifications.service";
import { ChatEvents } from "./chat.events";
import { needsPaymentSafetyWarning } from "./chat-safety";
import { MessagePageQueryDto, SendMessageDto } from "./dto/chat.dto";

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ChatEvents,
    private readonly notifications: NotificationsService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { deleted_at: null, participants: { some: { user_id: userId } } },
      include: {
        job: { select: { id: true, title: true, status: true } },
        participants: {
          include: { user: { include: { profile: true } } },
        },
        messages: {
          where: { deleted_at: null },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: { updated_at: "desc" },
    });
    const items = await Promise.all(
      rows.map(async (row) => {
        const participant = row.participants.find(
          (item) => item.user_id === userId,
        )!;
        const other = row.participants.find((item) => item.user_id !== userId);
        const unreadCount = await this.prisma.message.count({
          where: {
            conversation_id: row.id,
            sender_user_id: { not: userId },
            deleted_at: null,
            ...(participant.last_read_at
              ? { created_at: { gt: participant.last_read_at } }
              : {}),
          },
        });
        return {
          id: row.id,
          jobId: row.job?.id ?? null,
          jobTitle: row.job?.title ?? "কাজের আলোচনা",
          jobStatus: row.job?.status ?? null,
          otherUserId: other?.user_id ?? null,
          otherName: other?.user.profile?.display_name || "KAAJ ব্যবহারকারী",
          unreadCount,
          lastMessage: row.messages[0]
            ? await this.serializeMessage(row.messages[0], userId)
            : null,
          updatedAt: row.updated_at.toISOString(),
        };
      }),
    );
    return { items };
  }

  async open(userId: string, jobId: string, participantUserId: string) {
    if (userId === participantUserId)
      throw new BadRequestException("Cannot message yourself.");
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, deleted_at: null },
      select: { id: true, poster_user_id: true },
    });
    if (!job) throw new NotFoundException();
    const workerUserId =
      userId === job.poster_user_id ? participantUserId : userId;
    const isPair =
      (userId === job.poster_user_id && participantUserId === workerUserId) ||
      (participantUserId === job.poster_user_id && userId === workerUserId);
    if (!isPair) throw new NotFoundException();
    const eligible = await this.prisma.application.findFirst({
      where: { job_id: jobId, worker_user_id: workerUserId },
      select: { id: true },
    });
    if (!eligible) throw new NotFoundException();
    const scopeKey = `${jobId}:${workerUserId}`;
    const conversation = await this.prisma.conversation.upsert({
      where: { scope_key: scopeKey },
      update: { deleted_at: null },
      create: {
        job_id: jobId,
        scope_key: scopeKey,
        participants: {
          create: [{ user_id: job.poster_user_id }, { user_id: workerUserId }],
        },
      },
    });
    return { id: conversation.id };
  }

  async systemMessageForJob(jobId: string, workerUserId: string, body: string) {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { poster_user_id: true },
    });
    if (!job) return null;
    const opened = await this.open(workerUserId, jobId, job.poster_user_id);
    const participants = [workerUserId, job.poster_user_id];
    const message = await this.prisma.message.create({
      data: {
        conversation_id: opened.id,
        sender_user_id: null,
        type: MessageType.SYSTEM,
        body,
      },
    });
    await this.prisma.conversation.update({
      where: { id: opened.id },
      data: { updated_at: this.clock.now() },
    });
    const serialized = await this.serializeMessage(message, workerUserId);
    this.events.messages.next({
      conversationId: opened.id,
      participantUserIds: participants,
      message: serialized,
    });
    return serialized;
  }

  async messages(
    userId: string,
    conversationId: string,
    query: MessagePageQueryDto,
  ) {
    await this.assertParticipant(userId, conversationId);
    if (query.before && query.after) {
      throw new BadRequestException("Use either before or after cursor.");
    }
    const cursorId = query.before ?? query.after;
    const cursor = cursorId
      ? await this.prisma.message.findFirst({
          where: { id: cursorId, conversation_id: conversationId },
          select: { id: true, created_at: true },
        })
      : null;
    if (cursorId && !cursor) throw new NotFoundException();
    const after = Boolean(query.after);
    const rows = await this.prisma.message.findMany({
      where: {
        conversation_id: conversationId,
        deleted_at: null,
        ...(cursor
          ? {
              OR: [
                {
                  created_at: after
                    ? { gt: cursor.created_at }
                    : { lt: cursor.created_at },
                },
                {
                  created_at: cursor.created_at,
                  id: after ? { gt: cursor.id } : { lt: cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { created_at: after ? "asc" : "desc" },
        { id: after ? "asc" : "desc" },
      ],
      take: query.limit ?? 50,
    });
    const ordered = after ? rows : rows.reverse();
    return {
      items: await Promise.all(
        ordered.map((row) => this.serializeMessage(row, userId)),
      ),
    };
  }

  async send(userId: string, conversationId: string, input: SendMessageDto) {
    const conversation = await this.assertParticipant(userId, conversationId);
    const other = conversation.participants.find(
      (item) => item.user_id !== userId,
    );
    if (!other) throw new ConflictException("Conversation has no recipient.");
    await this.assertNotBlocked(userId, other.user_id);
    this.validateMessage(input);
    const attachmentKey = input.attachmentDocumentId
      ? await this.ownedChatAttachment(userId, input.attachmentDocumentId)
      : null;
    const warning =
      input.type === MessageType.TEXT && input.body
        ? needsPaymentSafetyWarning(input.body)
        : false;
    const message = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.message.findUnique({
        where: { client_nonce: input.clientNonce },
      });
      if (existing) {
        if (
          existing.sender_user_id !== userId ||
          existing.conversation_id !== conversationId
        ) {
          throw new ConflictException("Message nonce already used.");
        }
        return existing;
      }
      const created = await transaction.message.create({
        data: {
          conversation_id: conversationId,
          sender_user_id: userId,
          type: input.type,
          body: input.body?.trim() || null,
          attachment_key: attachmentKey,
          client_nonce: input.clientNonce,
          safety_warning: warning,
        },
      });
      await transaction.conversation.update({
        where: { id: conversationId },
        data: { updated_at: this.clock.now() },
      });
      if (warning) {
        await transaction.auditLog.create({
          data: {
            actor_user_id: userId,
            action: "CHAT_SAFETY_WARNING",
            entity: "Message",
            entity_id: created.id,
            after_json: { warningShown: true },
          },
        });
      }
      return created;
    });
    const serialized = await this.serializeMessage(message, userId);
    this.events.messages.next({
      conversationId,
      participantUserIds: conversation.participants.map((item) => item.user_id),
      message: serialized,
    });
    await this.notifications.create({
      userId: other.user_id,
      type: "CHAT_MESSAGE",
      title: "নতুন বার্তা",
      body: "একটি কাজের আলোচনায় নতুন বার্তা এসেছে।",
      payload: { conversationId, route: `/conversations/${conversationId}` },
      dedupeKey: `message:${message.id}`,
    });
    return serialized;
  }

  async markRead(userId: string, conversationId: string) {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: {
        conversation_id_user_id: {
          conversation_id: conversationId,
          user_id: userId,
        },
      },
      data: { last_read_at: this.clock.now() },
    });
    return { read: true };
  }

  async removeMessage(userId: string, messageId: string) {
    const result = await this.prisma.message.updateMany({
      where: { id: messageId, sender_user_id: userId, deleted_at: null },
      data: { deleted_at: this.clock.now() },
    });
    if (result.count !== 1) throw new NotFoundException();
    return { deleted: true };
  }

  async block(userId: string, blockedUserId: string) {
    if (userId === blockedUserId)
      throw new BadRequestException("Cannot block yourself.");
    await this.prisma.userBlock.upsert({
      where: {
        blocker_user_id_blocked_user_id: {
          blocker_user_id: userId,
          blocked_user_id: blockedUserId,
        },
      },
      update: {},
      create: { blocker_user_id: userId, blocked_user_id: blockedUserId },
    });
    return { blocked: true };
  }

  async unblock(userId: string, blockedUserId: string) {
    await this.prisma.userBlock.deleteMany({
      where: { blocker_user_id: userId, blocked_user_id: blockedUserId },
    });
    return { blocked: false };
  }

  async report(userId: string, conversationId: string, description: string) {
    await this.assertParticipant(userId, conversationId);
    const report = await this.prisma.report.create({
      data: {
        reporter_user_id: userId,
        target_type: "CONVERSATION",
        target_id: conversationId,
        reason_code: "CHAT_SAFETY",
        description: description.trim(),
      },
    });
    return { reportId: report.id, status: report.status };
  }

  async assertParticipant(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        deleted_at: null,
        participants: { some: { user_id: userId } },
      },
      include: { participants: true },
    });
    if (!conversation) throw new NotFoundException();
    return conversation;
  }

  private validateMessage(input: SendMessageDto) {
    if (input.type === MessageType.SYSTEM) {
      throw new BadRequestException("System messages cannot be sent by users.");
    }
    if (input.type === MessageType.TEXT && !input.body?.trim()) {
      throw new BadRequestException("Text messages need a body.");
    }
    if (input.type === MessageType.IMAGE && !input.attachmentDocumentId) {
      throw new BadRequestException("Image messages need an attachment.");
    }
  }

  private async assertNotBlocked(firstUserId: string, secondUserId: string) {
    const blocked = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blocker_user_id: firstUserId, blocked_user_id: secondUserId },
          { blocker_user_id: secondUserId, blocked_user_id: firstUserId },
        ],
      },
    });
    if (blocked)
      throw new ConflictException("Messaging is disabled between these users.");
  }

  private async ownedChatAttachment(userId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        user_id: userId,
        kind: "CHAT_IMAGE",
        deleted_at: null,
      },
    });
    if (!document) throw new NotFoundException();
    return document.storage_key;
  }

  private async serializeMessage(
    message: {
      id: string;
      conversation_id: string;
      sender_user_id: string | null;
      type: MessageType;
      body: string | null;
      attachment_key: string | null;
      client_nonce: string | null;
      safety_warning: boolean;
      created_at: Date;
    },
    viewerUserId: string,
  ) {
    const attachmentUrl = message.attachment_key
      ? (
          await this.storage.createDownloadUrl({
            key: message.attachment_key,
            expiresInSeconds: 300,
          })
        ).downloadUrl
      : null;
    return {
      id: message.id,
      conversationId: message.conversation_id,
      senderUserId: message.sender_user_id,
      isMine: message.sender_user_id === viewerUserId,
      type: message.type,
      body: message.body,
      attachmentUrl,
      clientNonce: message.client_nonce,
      safetyWarning: message.safety_warning,
      createdAt: message.created_at.toISOString(),
    };
  }
}
