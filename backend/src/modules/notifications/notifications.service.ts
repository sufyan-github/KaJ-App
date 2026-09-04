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
      items: items.map(serializeNotification),
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

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: userId, read_at: null },
      data: { read_at: new Date() },
    });
    return { updatedCount: result.count };
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

function serializeNotification(item: {
  id: string;
  type: string;
  title_key: string;
  body_key: string;
  payload_json: Prisma.JsonValue;
  read_at: Date | null;
  created_at: Date;
}) {
  const payload = asPayload(item.payload_json);
  const titleBn = titleFor(item.type, item.title_key);
  const bodyBn = bodyFor(item.type, item.body_key);
  const deepLink = deepLinkFor(item.type, payload);
  return {
    id: item.id,
    type: item.type,
    title: titleBn,
    body: bodyBn,
    titleBn,
    bodyBn,
    deepLink,
    payload,
    readAt: item.read_at?.toISOString() ?? null,
    createdAt: item.created_at.toISOString(),
  };
}

function asPayload(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value;
}

function titleFor(type: string, value: string): string {
  const titles: Record<string, string> = {
    APPLICATION_ACCEPTED: "আবেদন গ্রহণ করা হয়েছে",
    ASSIGNMENT_CANCELLED: "কাজ বাতিল হয়েছে",
    ASSIGNMENT_CONFIRMED: "বুকিং নিশ্চিত হয়েছে",
    ASSIGNMENT_DECLINED: "কর্মী কাজটি নিশ্চিত করেননি",
    BOOKING_REQUESTED: "নতুন বুকিং অনুরোধ",
    DISPUTE_OPENED: "বিরোধের অনুরোধ খোলা হয়েছে",
    JOB_APPLICATION_RECEIVED: "নতুন আবেদন",
    REVIEW_RECEIVED: "নতুন রিভিউ",
    VERIFICATION_SUBMITTED: "যাচাইয়ের অনুরোধ জমা হয়েছে",
    WORKER_CHECKED_IN: "কর্মী চেক-ইন করেছেন",
    WORK_REVIEW_REMINDER: "কাজটি পর্যালোচনার অপেক্ষায়",
    WORK_SUBMITTED: "কাজ জমা হয়েছে",
  };
  if (
    value.includes(".") ||
    /^[\x00-\x7F]+$/.test(value) ||
    value.trim().length === 0
  ) {
    return titles[type] ?? "KAAJ আপডেট";
  }
  return value;
}

function bodyFor(type: string, value: string): string {
  if (value === "verification.submitted.body") {
    return "আপনার পরিচয় যাচাইয়ের অনুরোধ পর্যালোচনার জন্য জমা হয়েছে।";
  }
  if (value === "dispute.opened.body") {
    return "বিরোধের তথ্য জমা হয়েছে। পরবর্তী আপডেট এখানে জানানো হবে।";
  }

  const dynamicEnglish: Array<[RegExp, (detail: string) => string]> = [
    [
      /^A worker applied to (.+)$/,
      (detail) => `${detail} কাজটিতে একজন কর্মী আবেদন করেছেন। আবেদন দেখুন।`,
    ],
    [
      /^Please review (.+)$/,
      (detail) => `${detail} কাজটি পর্যালোচনা করে নিশ্চিত করুন।`,
    ],
    [
      /^The worker confirmed (.+)$/,
      (detail) => `কর্মী ${detail} কাজটি নিশ্চিত করেছেন।`,
    ],
    [
      /^You were selected for (.+)$/,
      (detail) => `${detail} কাজের জন্য আপনাকে নির্বাচিত করা হয়েছে।`,
    ],
    [
      /^You received a booking request for (.+)$/,
      (detail) => `${detail} কাজের নতুন বুকিং অনুরোধ এসেছে।`,
    ],
    [/^(.+) was cancelled$/, (detail) => `${detail} কাজটি বাতিল হয়েছে।`],
    [
      /^(.+) is open for applications again$/,
      (detail) => `${detail} কাজটি আবার আবেদনের জন্য খোলা হয়েছে।`,
    ],
    [
      /^The worker arrived for (.+)$/,
      (detail) => `কর্মী ${detail} কাজের স্থানে পৌঁছে চেক-ইন করেছেন।`,
    ],
  ];
  for (const [pattern, render] of dynamicEnglish) {
    const match = pattern.exec(value);
    if (match?.[1]) return render(match[1]);
  }
  if (/^[\x00-\x7F]+$/.test(value) || value.trim().length === 0) {
    const fallback: Record<string, string> = {
      CHAT_MESSAGE: "একটি কাজের আলোচনায় নতুন বার্তা এসেছে।",
      REVIEW_RECEIVED: "আপনি একটি নতুন রিভিউ পেয়েছেন।",
    };
    return fallback[type] ?? "আপনার কাজের একটি নতুন আপডেট এসেছে।";
  }
  return value;
}

function deepLinkFor(
  type: string,
  payload: Record<string, unknown>,
): string | null {
  const assignmentId = stringValue(payload.assignmentId);
  const conversationId = stringValue(payload.conversationId);
  const disputeId = stringValue(payload.disputeId);
  const supplied = stringValue(payload.route);

  if (assignmentId && assignmentNotificationTypes.has(type)) {
    return `/assignments/${assignmentId}`;
  }
  if (conversationId && type === "CHAT_MESSAGE") {
    return `/conversations/${conversationId}`;
  }
  if (disputeId && type.startsWith("DISPUTE_")) {
    return `/disputes/${disputeId}`;
  }
  if (supplied?.startsWith("/")) return supplied;
  if (type.startsWith("VERIFICATION_")) return "/verification";
  if (type === "REVIEW_RECEIVED" || type === "REVIEW_REQUEST") {
    return "/reviews";
  }
  if (type.includes("APPLICATION")) return "/jobs";
  return null;
}

const assignmentNotificationTypes = new Set([
  "APPLICATION_ACCEPTED",
  "ASSIGNMENT_CANCELLED",
  "ASSIGNMENT_CONFIRMED",
  "ASSIGNMENT_DECLINED",
  "BOOKING_REQUESTED",
  "COMPLETION_PENDING",
  "JOB_CONFIRMED",
  "JOB_REMINDER_1H",
  "JOB_REMINDER_24H",
  "REVIEW_REQUEST",
  "WORKER_CHECKED_IN",
  "WORK_REVIEW_REMINDER",
  "WORK_SUBMITTED",
]);

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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
