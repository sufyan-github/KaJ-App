import "reflect-metadata";

import {
  AdminRole,
  ModerationLevel,
  PrismaClient,
  RiskIdentityKind,
  RiskReviewStatus,
  UserStatus,
} from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AdminActor } from "../src/modules/admin-auth/admin-auth.types";
import { RiskService } from "../src/modules/risk/risk.service";

const databaseDescribe =
  process.env.RISK_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("human risk review queue with PostgreSQL", () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const now = new Date("2026-09-05T10:00:00Z");
  const clock: Clock = { now: () => now };
  const risk = new RiskService(prismaService, clock);
  const userIds: string[] = [];
  let admin: AdminActor;

  beforeAll(async () => {
    const suffix = Date.now().toString().slice(-9);
    const [adminUser, first, second] = await Promise.all([
      prisma.user.create({
        data: {
          email: `risk-admin-${suffix}@test.local`,
          is_admin: true,
          profile: { create: { display_name: "Risk reviewer" } },
        },
      }),
      prisma.user.create({
        data: {
          phone_e164: `+88015${suffix}`,
          profile: { create: { display_name: "First observed account" } },
        },
      }),
      prisma.user.create({
        data: {
          phone_e164: `+88016${suffix}`,
          profile: { create: { display_name: "Second observed account" } },
        },
      }),
    ]);
    userIds.push(first.id, second.id);
    admin = {
      email: adminUser.email!,
      role: AdminRole.MODERATOR,
      sessionId: "risk-e2e-session",
      userId: adminUser.id,
    };
    await prisma.riskIdentityObservation.createMany({
      data: userIds.map((userId) => ({
        user_id: userId,
        kind: RiskIdentityKind.DEVICE,
        value_hash: `shared-device-${suffix}`,
        first_observed_at: now,
        last_observed_at: now,
      })),
    });
  });

  afterAll(async () => {
    await prisma.riskReviewItem.deleteMany({
      where: { subject_user_id: { in: userIds } },
    });
    await prisma.riskIdentityObservation.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { actor_user_id: admin.userId },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [...userIds, admin.userId] } },
    });
    await prisma.$disconnect();
  });

  it("creates one review item per detected account without taking action", async () => {
    const result = await risk.scan(
      "Daily human-review risk scan for the operations queue.",
      admin,
      context,
    );
    expect(result.automaticActions).toBe(0);
    expect(result.detectedAccounts).toBeGreaterThanOrEqual(2);
    const items = await prisma.riskReviewItem.findMany({
      where: { subject_user_id: { in: userIds } },
    });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.score === 55)).toBe(true);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
    });
    expect(
      users.every(
        (user) =>
          user.status === UserStatus.ACTIVE &&
          user.moderation_level === ModerationLevel.NONE,
      ),
    ).toBe(true);
  });

  it("refreshes an active item rather than duplicating it", async () => {
    const result = await risk.scan(
      "Repeat scan confirms open signals without duplicate queue items.",
      admin,
      context,
    );
    expect(result.refreshed).toBeGreaterThanOrEqual(2);
    expect(
      await prisma.riskReviewItem.count({
        where: {
          subject_user_id: { in: userIds },
          status: {
            in: [RiskReviewStatus.OPEN, RiskReviewStatus.UNDER_REVIEW],
          },
        },
      }),
    ).toBe(2);
  });

  it("requires a human decision and escalation still does not moderate", async () => {
    const item = await prisma.riskReviewItem.findFirstOrThrow({
      where: {
        subject_user_id: userIds[0],
        status: RiskReviewStatus.OPEN,
      },
    });
    await risk.startReview(item.id, admin, context);
    const decisions = await Promise.allSettled([
      risk.decide(
        item.id,
        {
          status: RiskReviewStatus.ESCALATED,
          reason: "Shared device evidence needs a separate moderation review.",
        },
        admin,
        context,
      ),
      risk.decide(
        item.id,
        {
          status: RiskReviewStatus.ESCALATED,
          reason: "Concurrent reviewer reached the same escalation outcome.",
        },
        admin,
        context,
      ),
    ]);
    expect(
      decisions.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      decisions.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const fulfilled = decisions.find(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<{
      automaticModerationAction: null;
    }>;
    expect(fulfilled.value.automaticModerationAction).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userIds[0] },
    });
    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(user.moderation_level).toBe(ModerationLevel.NONE);
  });

  it("returns adjudication metrics without treating open signals as labels", async () => {
    const queue = await risk.queue({ limit: 50, minScore: 0 }, admin, context);
    expect(queue.items.some((item) => item.subject.id === userIds[0])).toBe(
      true,
    );
    expect(queue.metrics.adjudicatedCount).toBeGreaterThanOrEqual(1);
    expect(queue.metrics.observedPrecisionBps).not.toBeNull();
  });
});

const context = { ip: "127.0.0.1", ua: "risk-e2e" };
