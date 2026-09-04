import "reflect-metadata";

import {
  AdminRole,
  PrismaClient,
  TrustLevel,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { StoragePort } from "../src/infra/storage/storage.port";
import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { AdminActor } from "../src/modules/admin-auth/admin-auth.types";
import { VerificationService } from "../src/modules/verification/verification.service";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("verification pipeline with PostgreSQL", () => {
  const prisma = new PrismaClient();
  const deletedKeys: string[] = [];
  const storage: StoragePort = {
    createDownloadUrl: async ({ key }) => ({
      downloadUrl: `https://private.test/${key}`,
      expiresAt: new Date("2026-09-04T10:01:00Z"),
      key,
    }),
    createUploadUrl: async () => {
      throw new Error("not used");
    },
    deleteObject: async (key) => {
      deletedKeys.push(key);
    },
    getObjectMetadata: async () => {
      throw new Error("not used");
    },
    readObject: async () => {
      throw new Error("not used");
    },
    writeObject: async () => {
      throw new Error("not used");
    },
  };
  const now = new Date("2026-09-04T10:00:00Z");
  const clock: Clock = { now: () => now };
  const verification = new VerificationService(
    prisma as unknown as PrismaService,
    storage,
    clock,
  );
  const adminOps = new AdminOpsService(
    prisma as unknown as PrismaService,
    storage,
    clock,
  );
  let userId: string;
  let adminId: string;
  let linkedDocumentId: string;
  let unusedDocumentId: string;
  let requestId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        phone_e164: "+8801999000201",
        profile: {
          create: { display_name: "Trust test", trust_level: TrustLevel.PHONE },
        },
      },
    });
    userId = user.id;
    const admin = await prisma.user.findFirstOrThrow({
      where: { is_admin: true, admin_credential: { isNot: null } },
      include: { admin_credential: true },
    });
    adminId = admin.id;
    const linked = await prisma.document.create({
      data: {
        user_id: userId,
        kind: "VERIFICATION_DOCUMENT",
        storage_key: `private/documents/${userId}/identity-linked.pdf`,
        mime: "application/pdf",
        size_bytes: 100n,
        is_sensitive: true,
      },
    });
    linkedDocumentId = linked.id;
    const unused = await prisma.document.create({
      data: {
        user_id: userId,
        kind: "VERIFICATION_DOCUMENT",
        storage_key: `private/documents/${userId}/identity-unused.pdf`,
        mime: "application/pdf",
        size_bytes: 100n,
        is_sensitive: true,
      },
    });
    unusedDocumentId = unused.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { user_id: userId } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actor_user_id: userId }, { actor_user_id: adminId }] },
    });
    await prisma.verificationDocument.deleteMany({
      where: { request: { user_id: userId } },
    });
    await prisma.verificationRequest.deleteMany({ where: { user_id: userId } });
    await prisma.document.deleteMany({ where: { user_id: userId } });
    await prisma.userBadge.deleteMany({ where: { user_id: userId } });
    await prisma.profile.deleteMany({ where: { user_id: userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("submits only linked evidence and exposes only that evidence to admins", async () => {
    const submitted = await verification.submit(userId, {
      kind: VerificationKind.IDENTITY,
      documentIds: [linkedDocumentId],
    });
    requestId = submitted.id;
    expect(submitted).toMatchObject({
      status: VerificationStatus.PENDING,
      documentIds: [linkedDocumentId],
    });

    const queue = await adminOps.verifications({ limit: 100 }, actor(), {
      ip: "127.0.0.1",
      ua: "trust-e2e",
    });
    const item = queue.items.find((entry) => entry.id === requestId);
    expect(item?.documents.map((document) => document.id)).toEqual([
      linkedDocumentId,
    ]);
    expect(item?.documents.map((document) => document.id)).not.toContain(
      unusedDocumentId,
    );
  });

  it("raises trust, grants a badge, notifies, and schedules purge", async () => {
    const decided = await adminOps.decideVerification(
      requestId,
      {
        status: VerificationStatus.APPROVED,
        reason: "Identity document matches the account holder.",
      },
      actor(),
      { ip: "127.0.0.1", ua: "trust-e2e" },
    );
    expect(decided.trustLevel).toBe(TrustLevel.IDENTITY);
    const [profile, badge, link, notification] = await Promise.all([
      prisma.profile.findUniqueOrThrow({ where: { user_id: userId } }),
      prisma.userBadge.findFirst({
        where: {
          user_id: userId,
          badge: { slug: "verified" },
          revoked_at: null,
        },
      }),
      prisma.verificationDocument.findUniqueOrThrow({
        where: {
          verification_request_id_document_id: {
            verification_request_id: requestId,
            document_id: linkedDocumentId,
          },
        },
      }),
      prisma.notification.findFirst({
        where: { user_id: userId, type: "VERIFICATION_DECIDED" },
      }),
    ]);
    expect(profile.trust_level).toBe(TrustLevel.IDENTITY);
    expect(badge).not.toBeNull();
    expect(link.purge_after?.toISOString()).toBe("2026-12-03T10:00:00.000Z");
    expect(notification).not.toBeNull();
  });

  it("purges due evidence from private storage and preserves the audit trail", async () => {
    await prisma.verificationDocument.update({
      where: {
        verification_request_id_document_id: {
          verification_request_id: requestId,
          document_id: linkedDocumentId,
        },
      },
      data: { purge_after: new Date("2026-09-04T09:59:59Z") },
    });
    await expect(verification.purgeExpiredDocuments()).resolves.toEqual({
      purged: 1,
    });
    expect(deletedKeys).toContain(
      `private/documents/${userId}/identity-linked.pdf`,
    );
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: linkedDocumentId },
    });
    expect(document.deleted_at).toEqual(now);
    expect(
      await prisma.auditLog.findFirst({
        where: {
          action: "VERIFICATION_DOCUMENT_PURGED",
          entity_id: linkedDocumentId,
        },
      }),
    ).not.toBeNull();
  });

  function actor(): AdminActor {
    return {
      userId: adminId,
      email: "admin@kaj.local",
      role: AdminRole.ADMIN,
      sessionId: "trust-e2e-session",
    };
  }
});
