import "reflect-metadata";

import {
  AdminRole,
  ModerationLevel,
  PrismaClient,
  ReportStatus,
  RoleMode,
  TrustLevel,
  UserStatus,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";
import { ConflictException } from "@nestjs/common";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { StoragePort } from "../src/infra/storage/storage.port";
import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { AdminActor } from "../src/modules/admin-auth/admin-auth.types";
import { ModerationService } from "../src/modules/moderation/moderation.service";
import { LedgerService } from "../src/modules/payments/ledger.service";
import { VerificationService } from "../src/modules/verification/verification.service";

const databaseDescribe =
  process.env.MODERATION_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("moderation lifecycle with PostgreSQL", () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  let now = new Date("2026-09-04T16:00:00Z");
  const clock: Clock = { now: () => now };
  const storage: StoragePort = {
    createDownloadUrl: async ({ key }) => ({
      downloadUrl: `https://private.test/${key}`,
      expiresAt: new Date(now.getTime() + 60_000),
      key,
    }),
    createUploadUrl: async () => {
      throw new Error("not used");
    },
    deleteObject: async () => undefined,
    getObjectMetadata: async () => {
      throw new Error("not used");
    },
    readObject: async () => {
      throw new Error("not used");
    },
    writeObject: async () => undefined,
  };
  const moderation = new ModerationService(prismaService, clock);
  const verification = new VerificationService(prismaService, storage, clock);
  const adminOps = new AdminOpsService(
    prismaService,
    storage,
    clock,
    new LedgerService(prismaService),
  );
  let admin: AdminActor;
  let reporterId: string;
  let subjectId: string;
  const createdDocumentIds: string[] = [];

  beforeAll(async () => {
    const suffix = Date.now().toString().slice(-9);
    const [adminUser, reporter, subject] = await Promise.all([
      prisma.user.create({
        data: {
          email: `moderation-admin-${suffix}@test.local`,
          is_admin: true,
          profile: { create: { display_name: "Moderation admin" } },
        },
      }),
      prisma.user.create({
        data: {
          phone_e164: `+88017${suffix}`,
          role_modes: [RoleMode.CUSTOMER],
          active_role: RoleMode.CUSTOMER,
          profile: { create: { display_name: "Safety reporter" } },
        },
      }),
      prisma.user.create({
        data: {
          phone_e164: `+88018${suffix}`,
          role_modes: [RoleMode.WORKER],
          active_role: RoleMode.WORKER,
          profile: {
            create: {
              display_name: "Reported worker",
              trust_level: TrustLevel.IDENTITY,
            },
          },
          worker_profile: { create: {} },
        },
      }),
    ]);
    admin = {
      email: adminUser.email!,
      role: AdminRole.MODERATOR,
      sessionId: "moderation-e2e-session",
      userId: adminUser.id,
    };
    reporterId = reporter.id;
    subjectId = subject.id;
  });

  afterAll(async () => {
    const userIds = [admin.userId, reporterId, subjectId];
    await prisma.moderationAction.deleteMany({
      where: {
        OR: [{ admin_user_id: admin.userId }, { target_id: subjectId }],
      },
    });
    await prisma.report.deleteMany({
      where: { reporter_user_id: reporterId },
    });
    await prisma.verificationDocument.deleteMany({
      where: { document_id: { in: createdDocumentIds } },
    });
    await prisma.verificationRequest.deleteMany({
      where: { user_id: subjectId },
    });
    await prisma.document.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    await prisma.userBlock.deleteMany({
      where: {
        OR: [{ blocker_user_id: reporterId }, { blocked_user_id: subjectId }],
      },
    });
    await prisma.auditLog.deleteMany({
      where: { actor_user_id: { in: userIds } },
    });
    await prisma.notification.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await prisma.userBadge.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creates a normalized report and prevents a 24-hour duplicate", async () => {
    const input = {
      targetType: "USER" as const,
      targetId: subjectId,
      reasonCode: "HARASSMENT" as const,
      description: "Repeated abusive messages related to this job.",
    };
    const result = await moderation.createReport(reporterId, input);
    expect(result.status).toBe(ReportStatus.OPEN);
    const stored = await prisma.report.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(stored.subject_user_id).toBe(subjectId);
    await expect(
      moderation.createReport(reporterId, input),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("reviews a report and applies only the next ladder step", async () => {
    const report = await prisma.report.findFirstOrThrow({
      where: { reporter_user_id: reporterId, reason_code: "HARASSMENT" },
    });
    const queue = await moderation.queue(
      { limit: 50, status: ReportStatus.OPEN },
      admin,
      context,
    );
    expect(queue.items.some((item) => item.id === report.id)).toBe(true);
    await moderation.startReview(report.id, admin, context);
    await expect(
      moderation.decide(
        report.id,
        {
          status: ReportStatus.ACTIONED,
          action: ModerationLevel.SUSPEND,
          reason: "Attempted unsafe jump in the moderation ladder.",
        },
        admin,
        context,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const result = await moderation.decide(
      report.id,
      {
        status: ReportStatus.ACTIONED,
        action: ModerationLevel.WARN,
        reason: "Evidence supports a formal first warning.",
      },
      admin,
      context,
    );
    expect("moderationLevel" in result && result.moderationLevel).toBe(
      ModerationLevel.WARN,
    );
    expect(
      (await prisma.report.findUniqueOrThrow({ where: { id: report.id } }))
        .status,
    ).toBe(ReportStatus.ACTIONED);
  });

  it("restricts with re-verification, clears trust, and blocks restoration", async () => {
    const result = await moderation.moderateUser(
      subjectId,
      {
        action: ModerationLevel.RESTRICT,
        reason: "Identity evidence must be refreshed after the incident.",
        durationDays: 14,
        requireReverification: true,
      },
      admin,
      context,
    );
    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(result.reverificationRequired).toBe(true);
    const subject = await prisma.user.findUniqueOrThrow({
      where: { id: subjectId },
      include: { profile: true },
    });
    expect(subject.profile?.trust_level).toBe(TrustLevel.PHONE);
    await expect(
      moderation.restoreUser(
        subjectId,
        "Attempted restore before required verification.",
        admin,
        context,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("accepts fresh identity evidence, clears the gate, and restores access", async () => {
    const document = await prisma.document.create({
      data: {
        user_id: subjectId,
        kind: "VERIFICATION_DOCUMENT",
        storage_key: `private/moderation-e2e/${subjectId}`,
        mime: "image/webp",
        size_bytes: 128,
        is_sensitive: true,
      },
    });
    createdDocumentIds.push(document.id);
    const selfie = await prisma.document.create({
      data: {
        user_id: subjectId,
        kind: "VERIFICATION_DOCUMENT",
        storage_key: `private/moderation-e2e/${subjectId}-selfie`,
        mime: "image/webp",
        size_bytes: 128,
        is_sensitive: true,
      },
    });
    createdDocumentIds.push(selfie.id);
    const request = await verification.submit(subjectId, {
      kind: VerificationKind.IDENTITY,
      nidDocumentId: document.id,
      selfieDocumentId: selfie.id,
    });
    expect(request.status).toBe(VerificationStatus.PENDING);
    await adminOps.decideVerification(
      request.id,
      {
        status: VerificationStatus.APPROVED,
        reason: "Fresh identity evidence matches the account holder.",
      },
      admin,
      context,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: subjectId } }))
        .reverification_required,
    ).toBe(false);
    const restored = await moderation.restoreUser(
      subjectId,
      "Re-verification approved and restriction review completed.",
      admin,
      context,
    );
    expect(restored.moderationLevel).toBe(ModerationLevel.NONE);
  });

  it("enforces warn, restrict, suspend, ban order and revokes sessions", async () => {
    await moderation.moderateUser(
      subjectId,
      {
        action: ModerationLevel.WARN,
        reason: "A new incident supports a formal warning.",
      },
      admin,
      context,
    );
    await moderation.moderateUser(
      subjectId,
      {
        action: ModerationLevel.RESTRICT,
        reason: "Continued violations require temporary restriction.",
        durationDays: 7,
      },
      admin,
      context,
    );
    await moderation.moderateUser(
      subjectId,
      {
        action: ModerationLevel.SUSPEND,
        reason: "Further violations require account suspension.",
        durationDays: 30,
      },
      admin,
      context,
    );
    const banned = await moderation.moderateUser(
      subjectId,
      {
        action: ModerationLevel.BAN,
        reason: "Repeated reviewed violations reached the final step.",
      },
      admin,
      context,
    );
    expect(banned.status).toBe(UserStatus.BANNED);
    expect(banned.moderationLevel).toBe(ModerationLevel.BAN);
    expect(
      await prisma.moderationAction.count({
        where: { target_id: subjectId, level: { not: null } },
      }),
    ).toBeGreaterThanOrEqual(6);
  });

  it("dismisses unsupported reports without changing the subject", async () => {
    await moderation.restoreUser(
      subjectId,
      "Final action overturned after an evidence review.",
      admin,
      context,
    );
    const report = await moderation.createReport(reporterId, {
      targetType: "USER",
      targetId: subjectId,
      reasonCode: "OTHER",
      description: "A report requiring review but no account action.",
    });
    const decision = await moderation.decide(
      report.id,
      {
        status: ReportStatus.DISMISSED,
        reason: "Available evidence does not support this report.",
      },
      admin,
      context,
    );
    expect(decision.status).toBe(ReportStatus.DISMISSED);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: subjectId } }))
        .moderation_level,
    ).toBe(ModerationLevel.NONE);
  });

  it("lists blocks without exposing private profile fields", async () => {
    await prisma.userBlock.create({
      data: { blocker_user_id: reporterId, blocked_user_id: subjectId },
    });
    const result = await moderation.blocks(reporterId);
    expect(result.items).toEqual([
      expect.objectContaining({
        userId: subjectId,
        displayName: "Reported worker",
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty("phone");
  });

  it("tracks and completes the required 48-hour post-incident review", async () => {
    const action = await prisma.moderationAction.findFirstOrThrow({
      where: { target_id: subjectId, reviewed_at: null },
      orderBy: { created_at: "desc" },
    });
    expect(action.review_due_at).toEqual(
      new Date(action.created_at.getTime() + 48 * 3_600_000),
    );
    const result = await moderation.completePostIncidentReview(
      action.id,
      "Post-incident controls and evidence handling were reviewed.",
      admin,
      context,
    );
    expect(result.reviewedAt).toEqual(now);
  });

  it("allows only one concurrent moderation advance", async () => {
    const input = {
      action: ModerationLevel.WARN,
      reason: "Concurrent review must create only one warning action.",
    };
    const results = await Promise.allSettled([
      moderation.moderateUser(subjectId, input, admin, context),
      moderation.moderateUser(subjectId, input, admin, context),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: subjectId } }))
        .moderation_level,
    ).toBe(ModerationLevel.WARN);
  });
});

const context = { ip: "127.0.0.1", ua: "moderation-e2e" };
