import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { PrismaClient, RoleMode } from "@prisma/client";

import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RedisService } from "../src/infra/redis/redis.service";
import { PaymentsService } from "../src/modules/payments/payments.service";

const databaseDescribe =
  process.env.MONEY_DATABASE_E2E === "1" ? describe : describe.skip;

databaseDescribe("money core with PostgreSQL and Redis", () => {
  const prisma = new PrismaClient();
  const prismaService = prisma as unknown as PrismaService;
  const config = new ConfigService({
    PLATFORM_FEE_DEFAULT_BPS: 800,
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  });
  const redis = new RedisService(config);
  const service = new PaymentsService(prismaService, config, redis);
  let posterId: string;
  let workerId: string;
  let jobId: string;
  let applicationId: string;
  let assignmentId: string;

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow();
    const location = await prisma.location.findFirstOrThrow({
      where: { type: "AREA" },
    });
    const poster = await prisma.user.create({
      data: {
        phone_e164: "+8801999000101",
        role_modes: [RoleMode.CUSTOMER],
        active_role: RoleMode.CUSTOMER,
      },
    });
    const worker = await prisma.user.create({
      data: {
        phone_e164: "+8801999000102",
        role_modes: [RoleMode.WORKER],
        active_role: RoleMode.WORKER,
      },
    });
    posterId = poster.id;
    workerId = worker.id;
    const job = await prisma.job.create({
      data: {
        poster_user_id: posterId,
        title: "Money core test",
        description: "Server-derived payment fixture",
        category_id: category.id,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
        location_id: location.id,
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
      },
    });
    assignmentId = assignment.id;
    await prisma.contract.create({
      data: {
        assignment_id: assignmentId,
        snapshot_json: {},
        platform_fee_poisha: 4_000n,
        worker_earning_poisha: 46_000n,
        cancellation_policy_json: {},
      },
    });
    await prisma.featureFlag.upsert({
      where: { key: "payments_enabled" },
      update: { is_enabled: false, rollout_percent: 0 },
      create: {
        key: "payments_enabled",
        is_enabled: false,
        rollout_percent: 0,
      },
    });
  });

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { actor_user_id: posterId } });
    await prisma.idempotencyRecord.deleteMany({
      where: { actor_user_id: posterId },
    });
    await prisma.payment.deleteMany({ where: { assignment_id: assignmentId } });
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: "CONFIRMED" },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "DRAFT" },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { actor_user_id: posterId } });
    await prisma.idempotencyRecord.deleteMany({
      where: { actor_user_id: posterId },
    });
    await prisma.payment.deleteMany({ where: { assignment_id: assignmentId } });
    await prisma.contract.deleteMany({
      where: { assignment_id: assignmentId },
    });
    await prisma.assignment.delete({ where: { id: assignmentId } });
    await prisma.application.delete({ where: { id: applicationId } });
    await prisma.job.delete({ where: { id: jobId } });
    await prisma.user.deleteMany({
      where: { id: { in: [posterId, workerId] } },
    });
    await redis.onModuleDestroy();
    await prisma.$disconnect();
  });

  it("returns the first exact response for a duplicate key", async () => {
    const first = await service.createIntent(
      posterId,
      assignmentId,
      "money-e2e-same-key",
    );
    const repeated = await service.createIntent(
      posterId,
      assignmentId,
      "money-e2e-same-key",
    );
    expect(repeated).toEqual(first);
    expect(first).toMatchObject({
      customerPaysPoisha: "50000",
      digitalPaymentsEnabled: false,
      feePoisha: "0",
      method: "CASH_ON_COMPLETION",
      workerReceivesPoisha: "50000",
    });
  });

  it("allows concurrent keys to converge on exactly one payment row", async () => {
    const results = await Promise.all([
      service.createIntent(posterId, assignmentId, "money-e2e-concurrent-a"),
      service.createIntent(posterId, assignmentId, "money-e2e-concurrent-b"),
    ]);
    expect(results[0]?.paymentId).toBe(results[1]?.paymentId);
    expect(
      await prisma.payment.count({ where: { assignment_id: assignmentId } }),
    ).toBe(1);
  });

  it("records an offline cash payment once and advances the job", async () => {
    await prisma.assignment.update({
      where: { id: assignmentId },
      data: { status: "COMPLETED" },
    });
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED" },
    });

    const first = await service.markCashPaid(posterId, assignmentId);
    const repeated = await service.markCashPaid(posterId, assignmentId);

    expect(first).toMatchObject({
      customerPaysPoisha: "50000",
      feePoisha: "0",
      method: "CASH_ON_COMPLETION",
      status: "CASH_RECORDED",
      workerReceivesPoisha: "50000",
    });
    expect(repeated).toEqual(first);
    await expect(
      prisma.payment.count({ where: { assignment_id: assignmentId } }),
    ).resolves.toBe(1);
    await expect(
      prisma.job.findUnique({ where: { id: jobId } }),
    ).resolves.toMatchObject({ status: "PAYMENT_RECORDED" });
    await expect(
      prisma.auditLog.count({
        where: {
          actor_user_id: posterId,
          action: "cash-payment.recorded",
        },
      }),
    ).resolves.toBe(1);
  });
});
