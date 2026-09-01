import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationChannel, Prisma } from "@prisma/client";

import { PrismaService } from "../../infra/prisma/prisma.service";
import { NotificationPreferenceDto } from "./dto/notification-preference.dto";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    payload?: Prisma.InputJsonObject;
    dedupeKey?: string;
  }) {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: {
        user_id_channel_type: {
          user_id: input.userId,
          channel: NotificationChannel.IN_APP,
          type: input.type,
        },
      },
    });
    if (preference?.is_enabled === false) return null;

    const payload: Prisma.InputJsonObject = {
      ...(input.payload ?? {}),
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
    };
    if (input.dedupeKey) {
      const existing = await this.prisma.notification.findFirst({
        where: {
          user_id: input.userId,
          type: input.type,
          created_at: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
          payload_json: { path: ["dedupeKey"], equals: input.dedupeKey },
        },
      });
      if (existing) return existing;
    }
    return this.prisma.notification.create({
      data: {
        user_id: input.userId,
        type: input.type,
        title_key: input.title,
        body_key: input.body,
        payload_json: payload,
      },
    });
  }

  async list(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 100,
    });
    return {
      unreadCount: items.filter((item) => !item.read_at).length,
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title_key,
        body: item.body_key,
        payload: item.payload_json,
        readAt: item.read_at?.toISOString() ?? null,
        createdAt: item.created_at.toISOString(),
      })),
    };
  }

  async markRead(userId: string, notificationId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, user_id: userId },
      data: { read_at: new Date() },
    });
    if (result.count !== 1) throw new NotFoundException();
    return { id: notificationId, isRead: true };
  }

  async preferences(userId: string) {
    const items = await this.prisma.notificationPreference.findMany({
      where: { user_id: userId },
      orderBy: [{ channel: "asc" }, { type: "asc" }],
    });
    return { items: items.map(serializePreference) };
  }

  async setPreference(userId: string, input: NotificationPreferenceDto) {
    const preference = await this.prisma.notificationPreference.upsert({
      where: {
        user_id_channel_type: {
          user_id: userId,
          channel: input.channel,
          type: input.type,
        },
      },
      create: {
        user_id: userId,
        channel: input.channel,
        type: input.type,
        is_enabled: input.isEnabled,
        quiet_hours_start: parseTime(input.quietHoursStart),
        quiet_hours_end: parseTime(input.quietHoursEnd),
      },
      update: {
        is_enabled: input.isEnabled,
        quiet_hours_start: parseTime(input.quietHoursStart),
        quiet_hours_end: parseTime(input.quietHoursEnd),
      },
    });
    return serializePreference(preference);
  }
}

function parseTime(value?: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  return new Date(Date.UTC(1970, 0, 1, hour, minute));
}

function serializePreference(item: {
  channel: NotificationChannel;
  type: string;
  is_enabled: boolean;
  quiet_hours_start: Date | null;
  quiet_hours_end: Date | null;
}) {
  const time = (value: Date | null) =>
    value
      ? `${value.getUTCHours().toString().padStart(2, "0")}:${value.getUTCMinutes().toString().padStart(2, "0")}`
      : null;
  return {
    channel: item.channel,
    type: item.type,
    isEnabled: item.is_enabled,
    quietHoursStart: time(item.quiet_hours_start),
    quietHoursEnd: time(item.quiet_hours_end),
  };
}
