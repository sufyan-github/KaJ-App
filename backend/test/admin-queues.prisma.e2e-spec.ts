import "reflect-metadata";
import { randomUUID } from "node:crypto";

import {
  AdminRole,
  PrismaClient,
  ReportStatus,
  VerificationKind,
  VerificationStatus,
} from "@prisma/client";

import { Clock } from "../src/common/time/clock";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { StoragePort } from "../src/infra/storage/storage.port";
import { AdminOpsService } from "../src/modules/admin-ops/admin-ops.service";
import { CatalogService } from "../src/modules/catalog/catalog.service";
import { ModerationService } from "../src/modules/moderation/moderation.service";
import { LedgerService } from "../src/modules/payments/ledger.service";

const databaseDescribe =
  process.env.TRUST_DATABASE_E2E === "1" ? describe : describe.skip;

/**
 * Before: queues were oldest-first with no status filter and capped at 100,
 * so once 100 decided requests existed, new ones never appeared.
 */
databaseDescribe("admin review queues show actionable work first", () => {
  const prisma = new PrismaClient();
  const db = prisma as unknown as PrismaService;
  const clock: Clock = { now: () => new Date() };
  const storage = {
    createDownloadUrl: async ({ key }: { key: string }) => ({
      downloadUrl: `https://private.test/${key}`,
      expiresAt: new Date(Date.now() + 60_000),
      key,
    }),
  } as unknown as StoragePort;
  const catalog = { invalidateCache: jest.fn().mockResolvedValue(undefined) };
  const adminOps = new AdminOpsService(
    db,
    storage,
    clock,
    new LedgerService(db),
    undefined,
    catalog as unknown as CatalogService,
  );
  const createdSkillIds: string[] = [];
  const createdJobIds: string[] = [];
  const moderation = new ModerationService(db, clock);
  const context = { ip: "127.0.0.1", ua: "queue-test" };
  const userIds: string[] = [];
  let admin: {
    userId: string;
    email: string;
    role: AdminRole;
    sessionId: string;
  };

  async function user() {
    const created = await prisma.user.create({
      data: {
        phone_e164: `+88018${Math.floor(10_000_000 + Math.random() * 80_000_000)}`,
        profile: { create: { display_name: "Queue test user" } },
      },
    });
    userIds.push(created.id);
    return created.id;
  }

  beforeAll(async () => {
    const adminId = await user();
    admin = {
      userId: adminId,
      email: "queue-admin@test.invalid",
      role: AdminRole.ADMIN,
      sessionId: "queue-test",
    };
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { actor_user_id: { in: userIds } },
    });
    await prisma.skill.deleteMany({ where: { id: { in: createdSkillIds } } });
    await prisma.application.deleteMany({
      where: { job_id: { in: createdJobIds } },
    });
    await prisma.job.deleteMany({ where: { id: { in: createdJobIds } } });
    await prisma.report.deleteMany({
      where: { reporter_user_id: { in: userIds } },
    });
    await prisma.verificationRequest.deleteMany({
      where: { user_id: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("lists a new pending verification despite 120 older decided ones", async () => {
    const owner = await user();
    const old = new Date(Date.now() - 30 * 86_400_000);
    await prisma.verificationRequest.createMany({
      data: Array.from({ length: 120 }, () => ({
        user_id: owner,
        kind: VerificationKind.IDENTITY,
        status: VerificationStatus.APPROVED,
        created_at: old,
      })),
    });
    const pending = await prisma.verificationRequest.create({
      data: {
        user_id: owner,
        kind: VerificationKind.IDENTITY,
        status: VerificationStatus.PENDING,
      },
    });

    const result = await adminOps.verifications({ limit: 100 }, admin, context);
    expect(result.items.map((item) => item.id)).toContain(pending.id);
    expect(
      result.items.every((item) => item.status === VerificationStatus.PENDING),
    ).toBe(true);

    // History is still available on request.
    const approved = await adminOps.verifications(
      { limit: 100, status: VerificationStatus.APPROVED },
      admin,
      context,
    );
    expect(approved.items.length).toBe(100);
    expect(approved.nextCursor).not.toBeNull();
  });

  it("pages through a long queue with a cursor and no duplicates", async () => {
    const owner = await user();
    for (let index = 0; index < 5; index += 1)
      await prisma.verificationRequest.create({
        data: {
          user_id: owner,
          kind: VerificationKind.SKILL,
          status: VerificationStatus.PENDING,
          created_at: new Date(Date.UTC(2020, 0, 1, 0, index)),
        },
      });
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await adminOps.verifications(
        { limit: 2, cursor, search: "Queue test" },
        admin,
        context,
      );
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThanOrEqual(5);
  });

  it("lists only open or in-review reports by default", async () => {
    const reporter = await user();
    const decided = await prisma.report.create({
      data: {
        reporter_user_id: reporter,
        target_type: "USER",
        target_id: randomUUID(),
        reason_code: "SPAM",
        status: ReportStatus.DISMISSED,
      },
    });
    const open = await prisma.report.create({
      data: {
        reporter_user_id: reporter,
        target_type: "USER",
        target_id: randomUUID(),
        reason_code: "SPAM",
      },
    });
    const queue = await moderation.queue({ limit: 100 }, admin, context);
    const ids = queue.items.map((item) => item.id);
    expect(ids).toContain(open.id);
    expect(ids).not.toContain(decided.id);
  });

  it("creates a skill from the console, audits it and clears the app cache", async () => {
    const category = await prisma.category.findFirstOrThrow();
    catalog.invalidateCache.mockClear();
    const saved = await adminOps.saveSkill(
      null,
      {
        categoryId: category.id,
        slug: `queue-test-skill-${Date.now()}`,
        nameEn: "Queue test skill",
        nameBn: "পরীক্ষা দক্ষতা",
        isActive: true,
      },
      admin,
      context,
    );
    createdSkillIds.push(saved.id);
    expect(catalog.invalidateCache).toHaveBeenCalledTimes(1);
    expect(
      await prisma.auditLog.count({
        where: { entity_id: saved.id, action: "ADMIN_SKILL_CREATED" },
      }),
    ).toBe(1);
    const listed = await adminOps.skills(
      { categoryId: category.id },
      admin,
      context,
    );
    expect(listed.items.map((item) => item.id)).toContain(saved.id);
  });

  it("clears the app cache when a location is saved", async () => {
    const location = await prisma.location.findFirstOrThrow({
      where: { type: "CITY" },
    });
    catalog.invalidateCache.mockClear();
    await adminOps.saveLocation(
      location.id,
      {
        type: location.type,
        nameEn: location.name_en,
        nameBn: location.name_bn,
        isActive: location.is_active,
      },
      admin,
      context,
    );
    expect(catalog.invalidateCache).toHaveBeenCalledTimes(1);
  });

  it("refuses to reset an accepted application", async () => {
    const [category, location] = await Promise.all([
      prisma.category.findFirstOrThrow(),
      prisma.location.findFirstOrThrow(),
    ]);
    const poster = await user();
    const worker = await user();
    const job = await prisma.job.create({
      data: {
        poster_user_id: poster,
        title: "Unstick test job",
        description: "A synthetic job used by the unstick test.",
        category_id: category.id,
        location_id: location.id,
        job_type: "ONE_TIME",
        payment_model: "FIXED",
      },
    });
    createdJobIds.push(job.id);
    const application = await prisma.application.create({
      data: { job_id: job.id, worker_user_id: worker, status: "ACCEPTED" },
    });
    await expect(
      adminOps.unstickApplication(
        application.id,
        { status: "PENDING", reason: "Operator attempted a reset." },
        admin,
        context,
      ),
    ).rejects.toThrow("can't be reset");
    expect(
      (
        await prisma.application.findUniqueOrThrow({
          where: { id: application.id },
        })
      ).status,
    ).toBe("ACCEPTED");
  });
});
