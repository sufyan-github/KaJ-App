import { NotFoundException } from "@nestjs/common";
import { NotificationChannel } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";

describe("NotificationsService", () => {
  it("returns Bangla copy, unread count, and an exact destination for legacy rows", async () => {
    const prisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "notification-1",
            user_id: "user-1",
            type: "VERIFICATION_SUBMITTED",
            title_key: "verification.submitted.title",
            body_key: "verification.submitted.body",
            payload_json: { requestId: "request-1", kind: "IDENTITY" },
            read_at: null,
            created_at: new Date("2026-09-05T04:30:00.000Z"),
          },
          {
            id: "notification-2",
            user_id: "user-1",
            type: "APPLICATION_ACCEPTED",
            title_key: "Application accepted",
            body_key: "You were selected for গণিত পড়ানো",
            payload_json: { assignmentId: "assignment-1" },
            read_at: new Date("2026-09-05T04:35:00.000Z"),
            created_at: new Date("2026-09-05T04:25:00.000Z"),
          },
        ]),
      },
    } as unknown as PrismaService;

    const result = await new NotificationsService(prisma).list("user-1");

    expect(result.unreadCount).toBe(1);
    expect(result.items[0]).toMatchObject({
      title: "যাচাইয়ের অনুরোধ জমা হয়েছে",
      body: "আপনার পরিচয় যাচাইয়ের অনুরোধ পর্যালোচনার জন্য জমা হয়েছে।",
      titleBn: "যাচাইয়ের অনুরোধ জমা হয়েছে",
      bodyBn: "আপনার পরিচয় যাচাইয়ের অনুরোধ পর্যালোচনার জন্য জমা হয়েছে।",
      deepLink: "/verification",
    });
    expect(result.items[1]).toMatchObject({
      titleBn: "আবেদন গ্রহণ করা হয়েছে",
      bodyBn: "গণিত পড়ানো কাজের জন্য আপনাকে নির্বাচিত করা হয়েছে।",
      deepLink: "/assignments/assignment-1",
    });
  });

  it("marks every unread notification for the authenticated user", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 3 });
    const prisma = { notification: { updateMany } } as unknown as PrismaService;

    const result = await new NotificationsService(prisma).markAllRead("user-1");

    expect(result).toEqual({ updatedCount: 3 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", read_at: null },
      data: { read_at: expect.any(Date) },
    });
  });

  it("does not create a disabled in-app notification", async () => {
    const create = jest.fn();
    const prisma = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ is_enabled: false }),
      },
      notification: { create },
    } as unknown as PrismaService;

    const result = await new NotificationsService(prisma).create({
      userId: "user-1",
      type: "CHAT_MESSAGE",
      title: "নতুন বার্তা",
      body: "নতুন বার্তা এসেছে।",
    });

    expect(result).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("deduplicates the same event within 24 hours", async () => {
    const existing = { id: "notification-1" };
    const prisma = {
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({
          channel: NotificationChannel.IN_APP,
          is_enabled: true,
        }),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    } as unknown as PrismaService;

    const result = await new NotificationsService(prisma).create({
      userId: "user-1",
      type: "CHAT_MESSAGE",
      title: "নতুন বার্তা",
      body: "নতুন বার্তা এসেছে।",
      dedupeKey: "message-1",
    });

    expect(result).toBe(existing);
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it("does not let one user mark another user's notification as read", async () => {
    const prisma = {
      notification: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    } as unknown as PrismaService;

    await expect(
      new NotificationsService(prisma).markRead("user-1", "notification-2"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
