import "reflect-metadata";

import {
  AdminRole,
  DisputeDecision,
  DisputeStatus,
  JobStatus,
  PaymentMethod,
  PaymentStatus,
  PrismaClient,
  RoleMode,
} from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { StoragePort } from "../src/infra/storage/storage.port";
import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { AdminActor } from "../src/modules/admin-auth/admin-auth.types";
import { DisputesService } from "../src/modules/disputes/disputes.service";
import { NotificationsService } from "../src/modules/notifications/notifications.service";
import { LedgerService } from "../src/modules/payments/ledger.service";

const databaseDescribe =
  process.env.DISPUTE_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("dispute lifecycle with PostgreSQL", () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  let now = new Date("2026-09-04T12:00:00Z");
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
  const notifications = new NotificationsService(prismaService);
  const disputes = new DisputesService(
    prismaService,
    notifications,
    storage,
    clock,
  );
  const ledger = new LedgerService(prismaService);
  const adminOps = new AdminOpsService(prismaService, storage, clock, ledger);
  let posterId: string;
  let workerId: string;
  let outsiderId: string;
  let secondAdminId: string;
  let firstAdmin: AdminActor;
  let secondAdmin: AdminActor;
  let jobId: string;
  let applicationId: string;
  let assignmentId: string;
  let paymentId: string;
  let disputeId: string;

  beforeAll(async () => {
    const [category, location, seededAdmin] = await Promise.all([
      prisma.category.findFirstOrThrow(),
      prisma.location.findFirstOrThrow({ where: { type: "AREA" } }),
      prisma.user.findFirstOrThrow({ where: { is_admin: true } }),
    ]);
    firstAdmin = actor(seededAdmin.id, "admin@kaj.local");
    const [poster, worker, outsider, second] = await Promise.all([
      prisma.user.create({
        data: {
          phone_e164: "+8801999000301",
          role_modes: [RoleMode.CUSTOMER],
          active_role: RoleMode.CUSTOMER,
        },
      }),
      prisma.user.create({
        data: {
          phone_e164: "+8801999000302",
          role_modes: [RoleMode.WORKER],
          active_role: RoleMode.WORKER,
        },
      }),
      prisma.user.create({ data: { phone_e164: "+8801999000303" } }),
      prisma.user.create({
        data: {
          email: "second-dispute-admin@kaj.local",
          is_admin: true,
          admin_credential: {
            create: {
              role: AdminRole.MODERATOR,
              totp_secret_ciphertext: "test-only",
              totp_confirmed_at: now,
            },
          },
        },
      }),
    ]);
    posterId = poster.id;
    workerId = worker.id;
    outsiderId = outsider.id;
    secondAdminId = second.id;
    secondAdmin = actor(second.id, second.email!);
    const job = await prisma.job.create({
      data: {
        poster_user_id: posterId,
        title: "Dispute lifecycle test",
        description: "Work submitted for dispute testing",
        category_id: category.id,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
        location_id: location.id,
        status: JobStatus.SUBMITTED,
      },
    });
    jobId = job.id;
    const application = await prisma.application.create({
      data: { job_id: jobId, worker_user_id: workerId, status: "ACCEPTED" },
    });
    applicationId = application.id;
    const assignment = await prisma.assignment.create({
      data: {
        job_id: jobId,
        worker_user_id: workerId,
        application_id: applicationId,
        agreed_price_poisha: 50_000n,
        status: "CONFIRMED",
        submitted_at: now,
      },
    });
    assignmentId = assignment.id;
    await prisma.contract.create({
      data: {
        assignment_id: assignmentId,
        snapshot_json: { scope: "fixture" },
        platform_fee_poisha: 4_000n,
        worker_earning_poisha: 46_000n,
        cancellation_policy_json: {},
      },
    });
    const payment = await prisma.payment.create({
      data: {
        job_id: jobId,
        assignment_id: assignmentId,
        payer_user_id: posterId,
        agreed_amount_poisha: 50_000n,
        amount_poisha: 50_000n,
        fee_poisha: 4_000n,
        worker_earning_poisha: 46_000n,
        fee_rule_key: "GLOBAL:*",
        fee_payer: "worker",
        status: PaymentStatus.PENDING,
        method: PaymentMethod.CASH_ON_COMPLETION,
        idempotency_key: "dispute-e2e-payment",
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { user_id: { in: [posterId, workerId] } },
    });
    await prisma.auditLog.deleteMany({ where: { entity_id: disputeId } });
    await prisma.disputeAppeal.deleteMany({ where: { dispute_id: disputeId } });
    await prisma.disputeEvidence.deleteMany({
      where: { dispute_id: disputeId },
    });
    await prisma.dispute.deleteMany({ where: { id: disputeId } });
    await prisma.payment.delete({ where: { id: paymentId } });
    await prisma.contract.deleteMany({
      where: { assignment_id: assignmentId },
    });
    await prisma.assignment.delete({ where: { id: assignmentId } });
    await prisma.application.delete({ where: { id: applicationId } });
    await prisma.job.delete({ where: { id: jobId } });
    await prisma.user.deleteMany({
      where: { id: { in: [posterId, workerId, outsiderId, secondAdminId] } },
    });
    await prisma.$disconnect();
  });

  it("opens for a party, snapshots evidence, freezes payment, and hides from outsiders", async () => {
    const opened = await disputes.open(workerId, assignmentId, {
      reasonCode: "NOT_COMPLETED",
      description: "The submitted work needs a documented resolution review.",
    });
    disputeId = opened.id;
    expect(opened).toMatchObject({ status: DisputeStatus.EVIDENCE });
    const [stored, payment, job] = await Promise.all([
      prisma.dispute.findUniqueOrThrow({
        where: { id: disputeId },
        include: { evidence: true },
      }),
      prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      prisma.job.findUniqueOrThrow({ where: { id: jobId } }),
    ]);
    expect(stored.evidence).toHaveLength(3);
    expect(payment.frozen_at).toEqual(now);
    expect(job.status).toBe(JobStatus.DISPUTED);
    await expect(disputes.detail(outsiderId, disputeId)).rejects.toThrow();
  });

  it("accepts party evidence, then advances the expired evidence window", async () => {
    await expect(
      disputes.addEvidence(posterId, disputeId, {
        kind: "TEXT",
        text: "The agreed scope differs from the submitted work.",
      }),
    ).resolves.toMatchObject({ kind: "TEXT" });
    now = new Date("2026-09-06T12:00:01Z");
    await expect(disputes.reconcileDueDisputes()).resolves.toEqual({
      movedToReview: 1,
    });
    await expect(
      disputes.addEvidence(workerId, disputeId, {
        kind: "TEXT",
        text: "This evidence arrived after the deadline.",
      }),
    ).rejects.toThrow("closed");
  });

  it("tracks first response and resolves cash without ledger movement", async () => {
    await adminOps.startDisputeReview(disputeId, firstAdmin, context());
    const resolved = await adminOps.resolveDispute(
      disputeId,
      {
        decision: DisputeDecision.SPLIT,
        resolution:
          "Split outcome based on the contract and submitted evidence.",
        reason:
          "Both parties supplied evidence supporting a proportional outcome.",
        refundPoisha: 20_000,
        releasePoisha: 30_000,
        jobStatus: JobStatus.COMPLETED,
      },
      firstAdmin,
      context(),
    );
    expect(resolved).toMatchObject({
      ledgerPosted: false,
      refundPoisha: "20000",
      releasePoisha: "30000",
    });
    expect(
      await prisma.ledgerEntry.count({ where: { payment_id: paymentId } }),
    ).toBe(0);
  });

  it("allows one appeal and requires a second administrator", async () => {
    now = new Date("2026-09-06T13:00:00Z");
    await expect(
      disputes.appeal(posterId, disputeId, {
        reason:
          "The initial proportional decision overlooked the completion evidence.",
      }),
    ).resolves.toMatchObject({ status: "PENDING" });
    await expect(
      disputes.appeal(workerId, disputeId, {
        reason: "A duplicate appeal must not be accepted for this dispute.",
      }),
    ).rejects.toThrow("already");
    await expect(
      adminOps.resolveDispute(disputeId, fullRelease(), firstAdmin, context()),
    ).rejects.toThrow("second administrator");
    await expect(
      adminOps.resolveDispute(disputeId, fullRelease(), secondAdmin, context()),
    ).resolves.toMatchObject({ decision: DisputeDecision.RELEASE_FULL });
  });

  function fullRelease() {
    return {
      decision: DisputeDecision.RELEASE_FULL,
      resolution: "Second review confirms full release under the contract.",
      reason:
        "Independent appeal review considered the complete evidence record.",
      refundPoisha: 0,
      releasePoisha: 0,
      jobStatus: JobStatus.COMPLETED,
    };
  }

  function actor(userId: string, email: string): AdminActor {
    return { userId, email, role: AdminRole.ADMIN, sessionId: "dispute-e2e" };
  }

  function context() {
    return { ip: "127.0.0.1", ua: "dispute-e2e" };
  }
});
